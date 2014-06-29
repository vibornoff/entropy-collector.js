EntropyCollector
================

Collects random bits from mouse moves and keystrokes and estimates
the amount of Shannon entropy among collected samples.

Quick start
-----------

Add `<script src="path/to/entropy-collector.js"></script>` into your page.

Place `EntropyCollector.start()` into a suitable place.

Move your mouse and press keys for a couple of seconds and right after
get the entropy estimation from `EntropyCollector.estimatedEntropy`
and the noisy bits from `EntropyCollector.buffer`.

Don't forget to call `EntropyCollector.stop()` whenever you decide to stop
entropy collection.

Reference
---------

### EntropyCollector.eventTarget

DOM *EventTarget* to consume events from. Uses `document` as default target.
Setting new target will stop previously started collectors on the old target.

### EntropyCollector.start

Starts entropy collection at the current target.

### EntropyCollector.stop

Stops entropy collection at the current target.

### EntropyCollector.eventsCaptured

The number of events captured.

### EntropyCollector.estimatedEntropy

Estimated amount of Shannon entropy of collected samples.

### EntropyCollector.buffer

*ArrayBuffer* containing the noisy bits.
Use it to seed [CPRNG](http://en.wikipedia.org/wiki/Cryptographically_secure_pseudorandom_number_generator)
or to derive a cryptographic key with a [secure hash function](http://en.wikipedia.org/wiki/Cryptographic_hash_function).

**DON'T USE THESE BITS DIRECTLY**

TODO
----

Add support of mobile devices (acceletometer and g-sensor entropy collection).
