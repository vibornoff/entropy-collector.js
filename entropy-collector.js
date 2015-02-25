var EntropyCollector = ( function ( global ) {
    'use strict';

    var min = Math.min,
        max = Math.max,
        abs = Math.abs,
        floor = Math.floor,
        log = Math.log,
        pow = Math.pow,
        atan2 = Math.atan2,
        sqrt = Math.sqrt,
        LN2 = Math.LN2,
        PI = Math.PI;

    var _date_now = global.Date.now,
        _perf = global.performance,
        _perf_timing,
        _perf_now;

    if ( _perf ) {
        _perf_timing = _perf.timing;
        _perf_now = _perf.now;
    }

    // Timestamping

    var now, _time_start, _time_precision;

    if ( _perf_now ) {
        now = function () { return 1000 * _perf.now() | 0 };
        // FIXME spec says `performance.now()` SHOULD be µs-precise, though is't not guaranteed
        // FIXME required a way to reliably determine the precision at run time
        _time_precision = 1;
    }
    else {
        _time_start = ( _perf_timing ) ? _perf_timing.navigationStart : _date_now();
        now = function () { return 1000 * ( _date_now() - _time_start ) | 0 };
        _time_precision = 1000;
    }

    // EventTarget to bind to

    var _event_target = global.document || global;

    // Buffer for events

    var _buffer_size = 1024;
    var _buffer = new Int32Array( 2*_buffer_size );

    // Collected events

    // MAYBE TODO _entropy_mic_events, _entropy_cam_events
    var _time_events = _buffer.subarray(0, _buffer_size),
        _coord_events = _buffer.subarray(_buffer_size),
        _event_counter = 0;

    // Collectors

    var _last_t = 0, _last_x = 0, _last_y = 0;

    function _mouse_collector ( e ) {
        var i = _event_counter % _buffer_size,
            t = now(), x = e.screenX, y = e.screenY;

        if ( _event_counter ) {
            _time_events[i] = max( t - _last_t, 0 );
            _coord_events[i] = ( x - _last_x << 16 ) | ( y - _last_y & 0xffff );
        }

        _last_t = t, _last_x = x, _last_y = y;
        _event_counter++;
    }

    function _touch_collector ( e ) {
        for ( var i = 0; i < e.touches.length; i++ ) {
            _mouse_collector( e.touches[i] );
        }
    }

    function _keyboard_collector ( e ) {
        var i = _event_counter % _buffer_size,
            t = now();

        if ( _event_counter ) {
            _time_events[i] = max( t - _last_t, 0 );
        }

        _last_t = t;
        _event_counter++;
    }

    function start () {
        _event_target.addEventListener( 'mousemove', _mouse_collector );
        _event_target.addEventListener( 'mousedown', _mouse_collector );
        _event_target.addEventListener( 'mouseup', _mouse_collector );

        _event_target.addEventListener( 'touchmove', _touch_collector );
        _event_target.addEventListener( 'touchstart', _touch_collector );
        _event_target.addEventListener( 'touchend', _touch_collector );

        _event_target.addEventListener( 'keydown', _keyboard_collector );
        _event_target.addEventListener( 'keyup', _keyboard_collector );
    }

    function stop () {
        _event_target.removeEventListener( 'mousemove', _mouse_collector );
        _event_target.removeEventListener( 'mousedown', _mouse_collector );
        _event_target.removeEventListener( 'mouseup', _mouse_collector );

        _event_target.removeEventListener( 'touchmove', _touch_collector );
        _event_target.removeEventListener( 'touchstart', _touch_collector );
        _event_target.removeEventListener( 'touchend', _touch_collector );

        _event_target.removeEventListener( 'keydown', _keyboard_collector );
        _event_target.removeEventListener( 'keyup', _keyboard_collector );
    }

    // Hard math ☺

    var _estimated_entropy = 0;

    function _shannon0 ( A, W ) {
        var n = 0;
        for ( var k in A ) n += A[k];
        if ( !n ) return 0;

        var h = 0;
        for ( var k in A ) {
            var p = A[k] / n, w = W(k);
            if ( !w ) continue;
            h -= p * log( p / w );
        }

        return h;
    }

    function _shannon1 ( A, B, W ) {
        var n = 0;
        for ( var k in A ) n += A[k];
        if ( !n ) return 0;

        var h = 0;
        for ( var k in A ) {
            if ( !B[k] ) continue;
            h += ( A[k] / n ) * _shannon0( B[k], W );
        }

        return h;
    }

    function _time_median ( X ) {
        var Y = X.sort( function (a,b) { return a-b } );
        return Y[floor(Y.length/2)];
    }

    function _time_bar ( t, m ) {
        var d = abs(t - m) / _time_precision;
        var b = floor( log(1 + d) / LN2 );
        return ( t < 0 ) ? -b : b;
    }

    function _time_interval ( b, m ) {
        var s = ( b < 0 ) ? -1 : 1,
            t0 = m + s * ( pow( 2, abs(b) ) - 1 ),
            t1 = m + s * ( pow( 2, abs(b)+1 ) - 1 );
        if ( t0 < 0 ) t0 = 0;
        if ( t1 < 0 ) t1 = 0;
        return abs(t1-t0) * _time_precision;
    }

    function _coord_bar ( c ) {
        var x = c >> 16, y = (c << 16) >> 16,
            s = PI * ( x*x + y*y ) / 16,
            a = atan2( y, x );
        if ( a === PI ) a = -PI;
        return ( floor( log(1+s) / LN2 ) << 4 ) | ( 8 * (a + PI) / PI );
    }

    function _coord_interval ( b ) {
        var s0 = pow( 2, (b >>> 4) ) - 1,
            s1 = pow( 2, (b >>> 4) + 1 ) - 1;
        return s1 - s0;
    }

    function estimate () {
        // Filter out repeated events
        // though it causes some underestimation, it's ok

        var T = [ _time_events[0] ];
        for ( var i = 1; i < _buffer_size; i++ ) {
            if ( _time_events[i] == _time_events[i-1] ) continue;
            T.push( _time_events[i] );
        }

        var C = [ _coord_events[0] ];
        for ( var i = 1; i < _buffer_size; i++ ) {
            if ( _coord_events[i] == _coord_events[i-1] ) continue;
            C.push( _coord_events[i] );
        }

        // Calculate time values median
        var Tm = _time_median(T);

        // Interval width helper functions

        function _t_b ( t ) {
            return _time_bar( t, Tm );
        }

        function _t_i ( b ) {
            return _time_interval( parseInt(b), Tm ) / _time_precision;
        }

        function _c_i ( b ) {
            return _coord_interval( parseInt(b) );
        }

        // Build histogram with log-scale bars

        var TH0 = {}, Tl = T.length
        for ( var i = 0; i < Tl; i++ ) {
            var b = _t_b( T[i] );
            TH0[b] |= 0, TH0[b]++;
        }

        var CH0 = {}, Cl = C.length
        for ( var i = 0; i < Cl; i++ ) {
            var b = _coord_bar( C[i] );
            CH0[b] |= 0, CH0[b]++;
        }

        // First-order estimation
        var th0 = _shannon0( TH0, _t_i ) * Tl,
            ch0 = _shannon0( CH0, _c_i ) * Cl;

        // We need to go deeper …
        for ( var u = 1; u < Tl-1; u++ ) {
            // Build conditional histograms with log-scale bars
            var TH1 = {}, dep = 0;
            for ( var i = u; i < Tl; i++ ) {
                var seq = T.slice( i-u, i ).map( _t_b ).join(' ');
                var b = _t_b( T[i] );
                TH1[seq] = TH1[seq] || {}, TH1[seq][b] |= 0, TH1[seq][b]++;
                if ( TH1[seq][b] > 1 ) dep++;
            }

            if ( !dep ) break;

            // Higher-order estimation
            var th1 = _shannon1( TH0, TH1, _t_i ) * ( Tl - u );

            if ( ( th0 - th1 ) / th0 < 0.01 ) {
                th0 = th1;
                break;
            }

            // Flatten H1
            TH0 = {};
            for ( var a in TH1 ) {
                for ( var b in TH1[a] ) {
                    TH0[a+' '+b] = TH1[a][b];
                }
            }

            th0 = th1;
        }

        for ( var u = 1; u < Cl-1; u++ ) {
            // Build conditional histograms with log-scale bars
            var CH1 = {}, dep = 0;
            for ( var i = u; i < Cl; i++ ) {
                var seq = C.slice( i-u, i ).map( _coord_bar ).join(' ');
                var b = _coord_bar( C[i] );
                CH1[seq] = CH1[seq] || {}, CH1[seq][b] |= 0, CH1[seq][b]++;
                if ( CH1[seq][b] > 1 ) dep++;
            }

            if ( !dep ) break;

            // Higher-order estimation
            var ch1 = _shannon1( CH0, CH1, _coord_interval ) * ( Cl - u );

            if ( ( ch0 - ch1 ) / ch0 < 0.01 ) {
                ch0 = ch1;
                break;
            }

            // Flatten H1
            CH0 = {};
            for ( var a in CH1 ) {
                for ( var b in CH1[a] ) {
                    CH0[a+' '+b] = CH1[a][b];
                }
            }

            ch0 = ch1;
        }

        _estimated_entropy = floor( th0 / LN2 ) + floor( ch0 / LN2 );

        return _estimated_entropy;
    }

    return {
        get eventTarget () { return _event_target },
        set eventTarget (e) { stop(), _event_target = e },

        get eventsCaptured () { return min( _event_counter, _buffer_size ) },

        get estimatedEntropy () { return estimate() },

        get buffer () { return _buffer.buffer },

        start: start,
        stop: stop,
    };
})(self);
