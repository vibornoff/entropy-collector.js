var EntropyCollector = ( function ( global ) {
    'use strict';

    var min = Math.min,
        max = Math.max,
        abs = Math.abs,
        floor = Math.floor,
        log = Math.log,
        pow = Math.pow,
        LN2 = Math.LN2;

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
        _time_precision = 1;
    }
    else {
        _time_start = ( _perf_timing ) ? _perf_timing.navigationStart : _date_now();
        now = function () { return 1000 * ( _date_now() - _time_start ) | 0 };
        _time_precision = 1000;
    }

    // EventTarget to bind to

    var _event_target = global.document || global;

    // Collected events

    var _buffer_size = 1024;

    // TODO mobile devies: _accel_events, _grav_events
    // MAYBE _entropy_mic_events, _entropy_cam_events
    var _time_events = new Uint32Array(_buffer_size),
        _coord_events = new Uint32Array(_buffer_size),
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

    function _listen_events () {
        _event_target.addEventListener( 'mousemove', _mouse_collector );
        _event_target.addEventListener( 'mousedown', _mouse_collector );
        _event_target.addEventListener( 'mouseup', _mouse_collector );
    }

    function _unlisten_events () {
        _event_target.removeEventListener( 'mousemove', _mouse_collector );
        _event_target.removeEventListener( 'mousedown', _mouse_collector );
        _event_target.removeEventListener( 'mouseup', _mouse_collector );
    }

    // Hard math ☺

    var _estimated_entropy = 0;

    function _shannon0 ( A, W ) {
        var n = 0;
        for ( var k in A ) n += A[k];
        if ( !n ) return 0;

        var h = 0;
        for ( var k in A ) {
            var p = A[k] / n;
            if ( p <= 0 ) continue;
            var w = W( A, k );
            if ( w <= 0 ) continue;
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
            if ( B[k] === undefined ) continue;
            var p = A[k] / n;
            if ( p <= 0 ) continue;
            h += p * _shannon0( B[k], W );
        }

        return h;
    }

    function _time_bar ( t, m ) {
        var d = abs(t - m) / _time_precision;
        var b = floor( log(1 + d) / LN2 );
        if ( t < m ) b *= -1;
        return b;
    }

    function _time_interval ( b, m ) {
        var s = ( b < 0 ) ? -1 : 1;
        var t0 = s * ( pow( 2, abs(b) ) - 1 );
        if ( t0 < 0 ) t0 = 0;
        var t1 = s * ( pow( 2, abs(b)+1 ) - 1 );
        if ( t1 < 0 ) t1 = 0;
        return abs(t1-t0) * _time_precision;
    }

    function _time_median ( X ) {
        var Y = X.sort( function (a,b) { return a-b } );
        return Y[Y.length>>1];
    }

    function _estimate () {
        // Filter out repeated events
        // though it causes some underestimation, it's ok
        var T = [ _time_events[0] ];
        for ( var i = 1; i < _buffer_size; i++ ) {
            if ( _time_events[i] == _time_events[i-1] ) continue;
            T.push( _time_events[i] );
        }

        // Calculate median
        var Tm = _time_median(T);

        // interval width function
        function _t_i ( _, b ) {
            return _time_interval( parseInt(b), Tm ) / _time_precision;
        }

        // Build histogram with log-scale bars
        var TH0 = {};
        for ( var i = 0; i < T.length; i++ ) {
            var b = _time_bar( T[i], Tm );
            TH0[b] |= 0, TH0[b]++;
        }

        // First-order estimation
        var th0 = _shannon0( TH0, _t_i );

        // We need to go deeper …
        for ( var u = 1; u < T.length-1; u++ ) {
            // Build conditional histograms with log-scale bars
            var TH1 = {}, dep = 0;
            for ( var i = u; i < T.length; i++ ) {
                var seq = T.slice(i-u,i).map( function ( t ) { return _time_bar( t, Tm ) } ).join(' ');
                var b = _time_bar( T[i], Tm );
                TH1[seq] = TH1[seq] || {}, TH1[seq][b] |= 0, TH1[seq][b]++;
                if ( TH1[seq][b] > 1 ) dep++;
            }

            if ( !dep ) break;

            // Higher-order estimation
            var th1 = _shannon1( TH0, TH1, _t_i );

            if ( abs(th0 - th1) / th0 < 0.01 ) {
                th0 = th1;
                break;
            }

            // Flatten TH1
            TH0 = {};
            for ( var a in TH1 ) {
                for ( var b in TH1[a] ) {
                    TH0[a+' '+b] = TH1[a][b];
                }
            }
            th0 = th1;
        }

        return _estimated_entropy = floor( th0 * T.length / LN2 );
    }

    function _bytes () {
        return new Uint8Array( _time_events.buffer, 0, 4*min( _event_counter, _buffer_size ) );
    }

    return {
        get eventTarget () { return _event_target },
        set eventTarget (e) { _unlisten_events(), _event_target = e },

        get eventsCaptured () { return min( _event_counter, _buffer_size ) },

        get estimatedEntropy () { return _estimate() },

        start: _listen_events,
        stop: _unlisten_events,

        getBytes: _bytes
    };
})(self);
