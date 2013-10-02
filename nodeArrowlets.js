/* Copyright (c) 2008 Khoo Yit Phang
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/*
 * Trampoline-CPS arrows, using objects instead of closures.
 *
 * Arrows are written according to the following convention:
 *    1. Arrow types are named FooA.
 *
 *    2. Arrows are identified by their identity function FooA.prototype.FooA().
 *
 *    3. Functions are given an (auto)-lifting function Function.prototype.FooA() for each FooA; since all
 *       (single-argument) functions can be lifted into arrows.
 *
 *    4. Arrow constructors are divided into two types:
 *           i.  arrow prototype constructors constructs arrows around their specific function type (usually not used
 *               directly);
 *           ii. arrow constructors which already embed a specific (parameterized) function (typically built with arrow
 *               prototype constructors).
 *       (i.e., arrow prototype constructors are like abstract classes, arrow constructors like concrete classes).
 *
 *    5. Functions lifted via Function.prototype.FooA() are assumed to not know anything about arrows.
 *       Arrows can be constructed from functions via arrow (prototype) constructors. E.g.:
 *             var fA = f.FooA();    // f is just a single-argument function that knows nothing about FooA
 *             var gA = new FooA(g); // g has to conform to FooA's internal function representation
 *
 *    6. Arrow constructors begin with the idiom:
 *           if (!(this instanceof FooA))
 *               return new FooA(eventname);
 *       This allows arrows to be constructed without the new operator.
 *
 *    7. Every binary arrow combinator f.bar(g) begins with the idiom:
 *           g = g.FooA();
 *       This serves two purposes: it performs a dynamic-check on the arrow type (i.e., throws an error if g is
 *       incompatible with f); and it auto-lifts functions to arrows.
 */

/*
 * Box: a temporary (singleton) place to put stuff. Used as a helper for constructors with variadic arguments.
 */
function Box(content) {
    Box.single.content = content;
    return Box.single;
}
/* JavaScript hackery based on the strange semantics of "new":
 * - Box() assigns Box.single.value, so Box.single has to be defined;
 * - properties can be assigned to numbers (but have no effect);
 * - when Box.single = 1 (or any non-Object), "new Box" returns "this". */
Box.single = 1;
Box.single = new Box;
Box.prototype.toString = function Box$prototype$toString() {
    return "[Box " + this.content + "]";
}

/*
 * Tuple: constructor for tuples.
 *
 * JavaScript implementation of tuples that also maintains a flattened array representation (lazily).
 * Unit and singleton tuples are not allowed.
 *
 * A function can be called via Tuple.applyArrayTo(fn) with the flattened array as its arguments.
 */
function Tuple() {
    if (arguments[0] instanceof Box) {
        var components = arguments[0].content;
    } else {
        switch (arguments.length) {
            case 0:
            case 1:
                throw new TypeError("Unit/singleton tuples not supported");
            case 2:
                return new Pair(arguments[0], arguments[1]);
        }
        if (!(this instanceof Tuple)) {
            return new Tuple(Box(arguments));
        }
        var components = arguments;
    }
    /* properties */
    this.components = components;
    this.length = components.length;
}
Tuple.prototype.toString = function Tuple$prototype$toString() {
    return "[Tuple " + this.toTupleString() + "]";
}
Tuple.prototype.toTupleString = function Tuple$prototype$toTupleString() {
    /* avoid recursive calls due to browser recursion limit */
    var str = [];
    var stack = [];
    var current = this.components;
    var i = 0;
    /* traverse the tuple are print the components from left to right as was written */
    while (true) {
        var c = current[i];
        if (c instanceof Tuple) { /* begin nested tuple: push parent and restart traversal */
            str.push("(");
            stack.push(i + 1, current);
            current = c.components;
            i = 0;
            continue;
        } else if (i < current.length) { /* value: print */
            str.push(c);
            i++;
        } else if (stack.length > 0) { /* end nested tuple: pop parent and continue */
            str.push(")");
            current = stack.pop();
            i = stack.pop();
        } else { /* end of this tuple: return string */
            return str.join("");
        }
        if (i < current.length) { /* commas between values */
            str.push(",");
        }
    }
}
Tuple.prototype.item = function Tuple$prototype$item(n) {
    return this.components[n];
}
Tuple.prototype.bind = function Tuple$prototype$bind(f) {
    return f(x);
}
Tuple.prototype.applyTo = function Tuple$prototype$applyTo(f) {
    return f.apply(null, x.components);
}
Tuple.prototype.Array = function Tuple$prototype$Array() {
    if (this.memoarray) {
        return this.memoarray;
    }
    /* avoid recursive calls due to browser recursion limit */
    var stack = [];
    var array = [];
    var current = this;
    var i = 0;
    while (true) {
        var c = current.components[i];
        if (c instanceof Tuple) { /* begin nested tuple: if not memoized, push parent context and restart */
            if (c.memoarray) {
                Array.prototype.push.apply(array, c.memoarray);
                i++;
            } else {
                stack.push(i + 1, current, array);
                array = [];
                current = c;
                i = 0;
            }
        } else if (i < current.length) { /* value */
            array.push(c);
            i++;
        } else if (stack.length > 0) { /* end nested tuple: memoize and pop parent context */
            current.memoarray = array;
            array = stack.pop();
            Array.prototype.push.apply(array, current.memoarray);
            current = stack.pop();
            i = stack.pop();
        } else { /* end of this tuple */
            current.memoarray = array;
            return array;
        }
    }
}
Tuple.prototype.applyArrayTo = function Tuple$prototype$applyArrayTo(f) {
    return f.apply(null, this.Array());
}

/*
 * Pair: Constructor for pair tuples.
 *
 * Specialization for tuples that supports two additional methods - fst() and snd() - to access the first and second
 * components respectively.
 */
function Pair(fst, snd) {
    if (arguments.length != 2) {
        throw new TypeError("Pair tuples requires two components");
    }
    if (!(this instanceof Pair)) {
        return new Pair(fst, snd);
    }
    /* properties */
    this.components = arguments;
}
Pair.prototype = new Tuple(Box([null, null]));
Pair.prototype.toString = function Pair$prototype$toString() {
    return "[Pair " + this.toTupleString() + "]";
}
Pair.prototype.fst = function Pair$prototype$fst() {
	// allow use as a setter
	if (arguments.length == 1) {
		this.components[0] = arguments[0];
	}
	
    return this.components[0];
}
Pair.prototype.snd = function Pair$prototype$snd() {
	// allow use as a setter
	if (arguments.length == 1) {
		this.components[1] = arguments[0];
	}
	
    return this.components[1];
}

/*
 * Tuple.fromArray: factory method to create tuples from arrays.
 */
Tuple.fromArray = function Tuple$fromArray(array) {
    switch (array.length) {
        case 0:
        case 1:
            return array[0];
        case 2:
            return new Pair(array[0], array[1]);
        default:
            return new Tuple(Box(array));
    }
}

/*
 * MatchError: pattern-matching errors for tuples.
 */
function MatchError(message) {
    if (!(this instanceof MatchError))
        return new MatchError(message);
    this.message = message;
}
MatchError.prototype = new Error;
MatchError.prototype.name = "MatchError";

/*
 * Tuple.prototype.match(): pattern-matching on tuples.
 *
 * Matches a tuple to a pattern and returns an object with properties containing the matched values:
 *     tuple-pattern   ::= tuple-component (',' tuple-component)+
 *     tuple-component ::= identifier | blank | '(' tuple-pattern ')'
 *
 * E.g.: Tuple(1,2,Tuple(Tuple(3,4),5)).match("a,,(b,c)") returns { a:1; b:Tuple(3,4); c:5 }
 */
Tuple.prototype.memomatchers = {}; /* shared */
Tuple.prototype.compilematcher = function Tuple$prototype$compilematcher(pattern) {
    if (pattern in this.memomatchers) {
        return this.memomatchers[pattern];
    }
    /* compile a pattern into a function that assigns tuple components to an object;
     * also check that the tuple matches the pattern. */
    var list = pattern.replace(/^\s+|\s$|\s*([(),])\s*/g, "$1") /* trim whitespace */
                      .match(/\(|\)|,|[^(),]+/g); /* tokenize */
    if (!list) {
        throw new TypeError("Empty pattern");
    }
    var matcher = [ "var result={};with(tuple){" ];
    var stack = [];
    var i = 0;
    var expectcomma = false;
    for (var j = 0; j < list.length; j++) {
        var token = list[j];
        switch (token) {
            case "(": /* begin nested tuple: push parent context */
                if (expectcomma) {
                    throw new TypeError("Comma expected in pattern");
                }
                expectcomma = false;
                matcher.push("var c=components[" + i + "]");
                matcher.push("if(!(c instanceof Tuple))throw new MatchError('Not a tuple')");
                matcher.push("with(c){");
                stack.push(i, matcher.length);
                i = 0;
                break;
            case ")": /* end nested tuple: pop parent context */
                if (stack.length <= 0) {
                    throw new TypeError("Extra closing parentheses");
                }
                expectcomma = true;
                i++;
                if (i < 2) {
                    throw new TypeError("Unit/singleton patterns not supported");
                }
                matcher.splice(stack.pop(), 0,
                               "if(length>" + i + ")throw new MatchError('Tuple too long')",
                               "if(length<" + i + ")throw new MatchError('Tuple too short')");
                matcher.push("}");
                i = stack.pop();
                break;
            case ",":
                expectcomma = false;
                i++;
            case "": /* don't-care */
                break;
            default: /* assign to token */
                if (expectcomma) {
                    throw new TypeError("Comma expected in pattern");
                }
                expectcomma = true;
                matcher.push("result['" + token + "']=" + "components[" + i + "]");
                break;
        }
    }
    if (stack.length > 0) {
        throw new TypeError("Extra opening parentheses");
    }
    i++;
    if (i < 2) {
        throw new TypeError("Unit/singleton patterns not supported");
    }
    matcher.splice(1, 0,
                   "if(length>" + i + ")throw new MatchError('Tuple too long')",
                   "if(length<" + i + ")throw new MatchError('Tuple too short')");
    matcher.push("}return result");
    return this.memomatchers[pattern] = Function("tuple", matcher.join("\n"));
}
Tuple.prototype.match = function Tuple$prototype$match(pattern) {
    var matcher = this.compilematcher(pattern);
    return matcher(this);
}

/*
 * TaggedTupleFactory: helper factory for tagged-tuple constructors.
 */
function TaggedTupleFactory(array, tagged, constructor) {
    if (array[0] instanceof Box) {
        array = array[0].content;
    } else {
        if (array.length === 0) {
            if (constructor.Unit) {
                return constructor.Unit; /* reuse unit if available */
            }
            constructor.Unit = 1;
            return constructor.Unit = new constructor;
        }
        if (!(tagged instanceof constructor)) {
            return new constructor(Box(array));
        }
    }
    tagged.value = Tuple.fromArray(array);
    return tagged;
}

/*
 * AsyncA: prototype constructor for asynchronous arrows.
 * AsyncA :: ((Arguments [x, AsyncA.Instance { cont :: y -> () }]) -> ()) -> AsyncA x y
 *
 * Build an arrow around an AsyncA.Instance object-based CPS function t :: (x, a) -> (), where x is the input to the
 * arrow, and a is the AsyncA.Instance object.
 */
function AsyncA(t) {
    if (!(this instanceof AsyncA))
        return new AsyncA(t);
    this.t = t;
}
AsyncA.prototype.AsyncA = function AsyncA$prototype$AsyncA() {
    return this;
}
AsyncA.prototype.toString = function AsyncA$prototype$toString() {
    if (!(name in this)) {
        this.name = this.toAString();
    }
    return "[AsyncA " + this.name + "]";
}
AsyncA.prototype.toAString = function AsyncA$prototype$toAString() {
    return "anonymous";
}
AsyncA.prototype.run = function AsyncA$prototype$run() {
    return (new AsyncA.Instance(this, Tuple.fromArray(arguments))).progressA;
}

/*
 * AsyncA.terminalA: do-nothing arrow.
 * terminalA :: AsyncA _ ()
 */
AsyncA.terminalA = new AsyncA(function AsyncA$terminalA$t() {});
AsyncA.terminalA.toAString = function AsyncA$terminalA$toAString() {
    return "terminalA";
}

/*
 * AsyncA.Instance: bookkeeping object for AsyncA arrow instances.
 *
 * Keeps track of continuations composing AsyncA arrows, and executes them in order using an exception-based trampoline
 * (to avoid call stack overflow).
 */
AsyncA.Instance = function AsyncA$Instance(asynca, x) {
    /* progress */
    this.progressA = new ProgressA(this);
    this.cancellers = [];
    /* initial continuations */
    this.k = [AsyncA.terminalA, asynca];
    this.arguments = x;
    /* state */
    this.calldepthcounter = this.calldepthlimit;
    this.env = {};

    /* and start the whole thing, keeping the initial run short */
    this.trampoline(true, 0);
}
AsyncA.Instance.prototype.toString = function AsyncA$Instance$prototype$toString() {
    return "[AsyncA.Instance " + this.k + "]"
}

/* CPS limits */
AsyncA.Instance.prototype.calldepthlimit = 50;
AsyncA.Instance.prototype.timelimit = 30; /* 33 Hz */
AsyncA.Instance.prototype.interval = 10; /* must be > 0 for IE compatibility */

AsyncA.Instance.prototype.cont = function AsyncA$Instance$prototype$cont(x, f, g) {
    if (arguments.length > 3) {
        throw new TypeError("Wrong number of arguments");
    }
    if (--this.calldepthcounter < 0) {
        /* prepare to get on the (shared) trampoline */
        this.arguments = x;
        switch (arguments.length) {
            case 2: this.k.push(f); break;
            case 3: this.k.push(g, f); break;
        }
        this.calldepthcounter = this.calldepthlimit;
        this.trampoline(true);
    } else {
        /* continue directly */
        switch (arguments.length) {
            case 0:
            case 1:
                this.k.pop().t(x, this);
                break;
            case 2:
                f.t(x, this);
                break;
            case 3:
                this.k.push(g);
                f.t(x, this);
                break;
        }
        /* if we get here, we've either run out of continuations, or we're at an asynchronous gap (setTimeout(),
         * addEventListener(), etc); so return to the trampoline */
        this.calldepthcounter = 0;
        this.trampoline(false);
    }
}

/* The actual trampoline is shared by all arrow instances to correctly enforce timelimit and calldepthlimit.
 * In particular, nested arrows will see that a trampoline is already active by their parent arrow, and will not start
 * another trampoline because it will be on the parent's call stack (and hit/exceed the calldepthlimit).
 */
AsyncA.Instance.prototype.trampolinelist = []; /* shared */
AsyncA.Instance.prototype.trampoline = function AsyncA$Instance$prototype$trampoline(cont, timelimit) {
    var list = this.trampolinelist;
    /* prioritized by frequency */
    if (cont) {
        /* active    (cont === true)
         * undefined start trampoline
         * this      fall back on trampoline
         * other     join trampoline
         */
        if (list.active === this) {
            /* we are on this trampoline and still need it, so fall down the stack onto it */
            throw list;
        } else if (list.active) {
            /* some other instance is on the trampoline (i.e., this is a nested arrow); just wait in line
             * this ensures that the calldepthlimit is enforced correctly */
            list.push(this);
            return;
        }
    } else {
        /* we were on this trampoline, but no longer need it */
        if (list.active === this) {
            /* IE's XMLHttpRequest swallows exceptions, and HttpA instances end up calling trampoline(false) more than
             * once; so, do a check to avoid mangling the trampoline list. */
            list.active = list.shift();
        }
        throw list;
    }
    if (timelimit === undefined) {
        var timelimit = this.timelimit;
    }

    /* start new trampoline; at least one run will always be executed before timelimit is checked */
    var starttime = new Date();
    list.active = this;
    while (true) {
        try {
            list.active.cont(list.active.arguments);
        } catch (e) {
            if (e !== list) {
                /* it's a real exception! drop everything!
                 * TODO: provide an arrow error path, rather than just giving up */
                if (list.timer !== undefined) {
                    clearInterval(list.timer);
                    delete list.timer;
                }
                delete list.active;
                list.splice(0, list.length);
                throw e;
            }
        }
        if (!list.active) {
            /* no more instance to run; clear the timer if one is set */
            if (list.timer !== undefined) {
                clearInterval(list.timer);
                delete list.timer;
            }
            return;
        } else if ((new Date() - starttime) > timelimit) {
            /* exceeded time limit, so we'll yield to the browser and continue later */
            if (list.active === this) {
                /* be fair to others in line */
                list.push(list.active);
            } else {
                list.unshift(list.active);
            }
            /* set a timer if one isn't already
             * using setInterval limits the frequency of creating of timer handler closures */
            if (list.timer === undefined) { /* can setTimeout() return 0 as the timerid? */
                list.timer = setInterval(function AsyncA$Instance$prototype$trampoline$$timer() {
                    if (list.length === 0) {
                        /* drop everything upon failure */
                        clearInterval(list.timer);
                        delete list.timer;
                        delete list.active;
                        return;
                    }
                    list.shift().trampoline(true);
                }, this.interval);
            }
            delete list.active;
            return;
        }
    }
}

/*
 * ProgressA: arrows for tracking progress of an AsyncA arrow (i.e. progress event source).
 *
 * Two operations are supported: ProgressA arrows can be composed to handle progress events (from arrows calling
 * advance() or SignalA arrows) of their corresponding AsyncA arrows instance; ProgressA arrows can also be used to
 * cancel the entire operation their AsyncA arrows.
 *
 * The implementation of ProgressA is actually split across ProgressA as the public interface, and AsyncA.Instance
 * containing the private interface.
 */
function ProgressA(instance) {
    if (!(this instanceof ProgressA))
        return new ProgressA(instance);
    this.instance = instance;
    this.eventlisteners = {};
}
ProgressA.prototype = new AsyncA(function ProgressA$prototype$t(x, a) {
    a.cont(this);
});
ProgressA.prototype.toAString = function ProgressA$prototype$toAString() {
    return "ProgressA";
}
ProgressA.prototype.cancel = function ProgressA$prototype$cancel() {
    this.instance.cancel();
}
/* DOM EventTarget interface: http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-EventTarget */
ProgressA.prototype.addEventListener = function ProgressA$prototype$addEventListener(eventname, handler, capturing) {
    if (!(eventname in this.eventlisteners)) {
        this.eventlisteners[eventname] = [[], []]; /* initialize when eventname is first seen */
    }
    var listeners = this.eventlisteners[eventname][capturing ? 1 : 0];
    var index = listeners.indexOf(handler);
    if (index < 0) { /* doesn't exist */
        listeners.push(handler);
    }
}
ProgressA.prototype.removeEventListener = function ProgressA$prototype$removeEventListener(eventname, handler, capturing) {
    if (!(eventname in this.eventlisteners)) {
        return;
    }
    var listeners = this.eventlisteners[eventname][capturing ? 1 : 0];
    var index = listeners.indexOf(handler);
    if (index >= 0) {
        listeners.splice(index, 1); /* found, remove */
    }
}
ProgressA.prototype.dispatchEvent = function ProgressA$prototype$dispatchEvent(event) {
    /* TODO: should preventDefault() or stopPropogation() affect ProgressA? */
    var eventname = event.type;
    if (!(eventname in this.eventlisteners)) {
        return;
    }
    for (var capturing = 1; capturing >= 0; capturing--) {
        var listeners = this.eventlisteners[eventname][capturing].concat(); /* clone */
        var length = listeners.length;
        for (var i = 0; i < length; i++) {
            listeners[i](event);
        }
    }
}

/* ProgressA.Event should be like DOM Event interface, but it doesn't quite fit:
 * http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-Event */
ProgressA.Event = function ProgressA$Event(eventname, detail) {
    this.type = eventname;
    this.detail = detail;
}

/* ProgressA private interface */
AsyncA.Instance.prototype.signal = function AsyncA$Instance$prototype$signal(event, detail) {
    if (typeof event === "string" || event instanceof String) {
        event = new ProgressA.Event(event, detail);
    }
    this.progressA.dispatchEvent(event, this.progressA);
}
AsyncA.Instance.prototype.addCanceller = function AsyncA$Instance$prototype$addCanceller(canceller) {
    this.cancellers.push(canceller);
}
AsyncA.Instance.prototype.advance = function AsyncA$Instance$prototype$advance(canceller) {
    /* remove canceller function */
    var index = this.cancellers.indexOf(canceller);
    if (index >= 0) {
        this.cancellers.splice(index, 1);
    }
    /* signal progress */
    this.signal("progress");
}
AsyncA.Instance.prototype.cancel = function AsyncA$Instance$prototype$cancel() {
    /* cancel all in-progress arrows */
    var cancellers = this.cancellers;
    this.cancellers = [];
    while (cancellers.length > 0)
        cancellers.pop()();
}

/*
 * SignalA: Arrows for signalling progress events.
 * SignalA :: String -> AsyncA a a
 */
function SignalA(eventname) {
    if (!(this instanceof SignalA))
        return new SignalA(eventname);
    this.eventname = (eventname == null ? "signal" : eventname);
}
SignalA.prototype = new AsyncA(function SignalA$prototype$t(x, a) {
    a.signal(this.eventname, x);
    a.cont(x);
});
SignalA.prototype.toAString = function SignalA$prototype$toAString() {
    return "SignalA(" + this.eventname + ")";
}

/*
 * Arr: lifting combinator for Tuple-aware functions.
 * Arr :: ((Tuple a) -> b) -> AsyncA (Tuple a) b
 */
AsyncA.ArrThunk = function AsyncA$ArrThunk(f) {
    this.f = f;
}
AsyncA.ArrThunk.prototype = new AsyncA(function AsyncA$ArrThunk$prototype$t(x, a) {
    a.cont(this.f(x));
});
AsyncA.ArrThunk.prototype.toAString = function AsyncA$ArrThunk$prototype$toAString() {
    var name = this.f.name || /^\(?function\s*([^(\s]*)/.exec(this.f.toString())[1];
    return "Arr" + (name ? " " + name : "");
}
Function.prototype.Arr = function Function$prototype$Arr() {
    return new AsyncA.ArrThunk(this);
}
function Arr(f) {
    return f.Arr();
}

/*
 * Function.prototype.AsyncA: lifting combinator for JavaScript functions.
 * AsyncA :: ((Arguments a) -> b) -> AsyncA (Arguments a) b
 *
 * Note this combinator assumes that JavaScript functions are not Tuple-aware, and will use Tuple.applyTo.
 * Tuple-aware functions have to be lifted with Arr instead.
 */
AsyncA.FunctionThunk = function AsyncA$FunctionThunk(f) {
    this.f = f;
}
AsyncA.FunctionThunk.prototype = new AsyncA(function AsyncA$FunctionThunk$prototype$t(x, a) {
    if (x instanceof Tuple) { /* unpack tuple */
        a.cont(x.applyArrayTo(this.f));
    } else {
        a.cont(this.f(x));
    }
});
AsyncA.FunctionThunk.prototype.toAString = function AsyncA$FunctionThunk$prototype$toAString() {
    var name = this.f.name || /^\(?function\s*([^(\s]*)/.exec(this.f.toString())[1];
    return "Function" + (name ? " " + name : "");
}
Function.prototype.AsyncA = function Function$prototype$AsyncA() {
    return new AsyncA.FunctionThunk(this);
}

/*
 * AsyncA.prototype.compose (aliases: then, next, >>>): composition combinator.
 * compose :: AsyncA a b -> AsyncA b c -> AsyncA a c
 */
AsyncA.ComposeThunk = function AsyncA$ComposeThunk(f, g) {
    this.f = f;
    this.g = g;
}
AsyncA.ComposeThunk.prototype = new AsyncA(function AsyncA$ComposeThunk$prototype$t(x, a) {
    a.cont(x, this.f, this.g);
});
AsyncA.ComposeThunk.prototype.toAString = function AsyncA$ComposeThunk$prototype$toAString() {
    return "(" + this.f.toAString() + " >>> " + this.g.toAString() + ")";
}

AsyncA.prototype.then = AsyncA.prototype.next = AsyncA.prototype[">>>"] =
AsyncA.prototype.compose = function AsyncA$prototype$compose(g) {
    return new AsyncA.ComposeThunk(this, g.AsyncA());
}

Function.prototype.then = Function.prototype.next = Function.prototype[">>>"] =
Function.prototype.compose = function Function$prototype$compose(g) {
    return this.AsyncA().compose(g);
}

/*
 * AsyncA.prototype.product (alias: pair, ***): product combinator.
 * product :: AsyncA a b -> AsyncA x y -> AsyncA (Tuple [a, x]) (Tuple [b, y])
 */
AsyncA.ProductThunk = function AsyncA$ProductThunk(f, g) {
    this.f = f;
    this.g = g;
}
AsyncA.ProductThunk.prototype = new AsyncA(function AsyncA$ProductThunk$prototype$t(x, a) {
    var cancel = function AsyncA$ProductThunk$prototype$t$$cancel() {
        first.cancel();
        second.cancel();
    }
    a.addCanceller(cancel);

    var y1, y2;
    var count = 2;
    var barrier = function AsyncA$ProductThunk$prototype$t$$barrier() {
        if (--count == 0) {
            a.advance(cancel);
            a.cont(new Pair(y1, y2));
        }
    }
    var first = this.f.compose(Arr(function AsyncA$ProductThunk$prototype$t$$first(y) {
        y1 = y;
        barrier();
    })).run(x.fst());
    var second = this.g.compose(Arr(function AsyncA$ProductThunk$prototype$t$$second(y) {
        y2 = y;
        barrier();
    })).run(x.snd());
});
AsyncA.ProductThunk.prototype.toAString = function AsyncA$ProductThunk$prototype$toAString() {
    return "(" + this.f.toAString() + " *** " + this.g.toAString() + ")";
}

AsyncA.prototype.pair = AsyncA.prototype["***"] =
AsyncA.prototype.product = function AsyncA$prototype$product(g) {
    return new AsyncA.ProductThunk(this, g.AsyncA());
}
Function.prototype.pair = Function.prototype["***"] =
Function.prototype.product = function Function$prototype$product(g) {
    return this.AsyncA().product(g);
}

/*
 * AsyncA.returnA: identity arrow, used by first and second combinator, among others.
 * returnA :: AsyncA a a
 */
AsyncA.returnA = Arr(function AsyncA$returnA(x) {
    return x;
});
AsyncA.returnA.toAString = function AsyncA$returnA$toAString() {
    return "returnA";
}

/*
 * AsyncA.prototype.first: first combinator.
 * first :: AsyncA a b -> AsyncA (Tuple [a, c]) (Tuple [b, c])
 *
 * Equivalent to f.product(AsyncA.returnA).
 */
AsyncA.FirstThunk = function AsyncA$FirstThunk(f) {
    this.f = f;
}
AsyncA.FirstThunk.prototype = new AsyncA.ProductThunk(null, AsyncA.returnA);
AsyncA.FirstThunk.prototype.toAString = function AsyncA$FirstThunk$prototype$toAString() {
    return "first " + this.f.toAString();
}
AsyncA.prototype.first = function AsyncA$prototype$first() {
    return new AsyncA.FirstThunk(this);
}
Function.prototype.first = function Function$prototype$first() {
    return this.AsyncA().first();
}

/*
 * AsyncA.prototype.second: second combinator.
 * second :: AsyncA a b -> AsyncA (Tuple [c, a]) (Tuple [c, b])
 *
 * Equivalent to AsyncA.returnA.product(f).
 */
AsyncA.SecondThunk = function AsyncA$SecondThunk(g) {
    this.g = g;
}
AsyncA.SecondThunk.prototype = new AsyncA.ProductThunk(AsyncA.returnA, null);
AsyncA.SecondThunk.prototype.toAString = function AsyncA$SecondThunk$prototype$toAString() {
    return "second " + this.g.toAString();
}
AsyncA.prototype.second = function AsyncA$prototype$second() {
    return new AsyncA.SecondThunk(this);
}
Function.prototype.second = function Function$prototype$second() {
    return this.AsyncA().second();
}

/*
 * AsyncA.fanoutA: fanout arrow, used by fanout combinator.
 * fanoutA :: AsyncA a (a, a)
 */
AsyncA.fanoutA = Arr(function AsyncA$fanoutA(x) {
    return new Pair(x, x);
});
AsyncA.fanoutA.toAString = function AsyncA$fanoutA$toAString() {
    return "fanoutA";
}

/*
 * AsyncA.prototype.fanout (aliases: split, &&&): fanout combinator.
 * fanout :: AsyncA a b -> AsyncA a c -> AsyncA a (Tuple [b, c])
 *
 * Equivalent to AsyncA.fanoutA.compose(f.product(g)).
 */
AsyncA.FanoutThunk = function AsyncA$FanoutThunk(f, g) {
    this.g = f.product(g);
}
AsyncA.FanoutThunk.prototype = new AsyncA.ComposeThunk(AsyncA.fanoutA, null);
AsyncA.FanoutThunk.prototype.toAString = function AsyncA$FanoutThunk$prototype$toAString() {
    return "(" + this.g.f.toAString() + " &&& " + this.g.g.toAString() + ")";
}
AsyncA.prototype.split = AsyncA.prototype["&&&"] =
AsyncA.prototype.fanout = function AsyncA$prototype$fanout(g) {
    return new AsyncA.FanoutThunk(this, g.AsyncA());
}
Function.prototype.split = Function.prototype["&&&"] =
Function.prototype.fanout = function Function$prototype$fanout(g) {
    return this.AsyncA().fanout(g);
}

/*
 * AsyncA.prototype.bind: bind combinator.
 * bind :: AsyncA a b -> AsyncA (a, b) c -> AsyncA a c
 *
 * Equivalent to AsyncA.returnA.fanout(f).then(g).
 */
AsyncA.BindThunk = function AsyncA$BindThunk(f, g) {
    this.f = AsyncA.returnA.fanout(f);
    this.g = g;
}
AsyncA.BindThunk.prototype = new AsyncA.ComposeThunk(null, null);
AsyncA.BindThunk.prototype.toAString = function AsyncA$BindThunk$prototype$toAString() {
    return "(" + this.f.g.toAString() + " `bind` " + this.g.toAString() + ")";
}
AsyncA.prototype.bind = function AsyncA$prototype$bind(g) {
    return new AsyncA.BindThunk(this, g.AsyncA());
}
// node 10 puts 'bind' onto Function.prototype
// so let's not conflict with it
Function.prototype.bindA = function Function$prototype$bind(g) {
    return this.AsyncA().bind(g);
}

/*
 * AsyncA.prototype.join: join combinator.
 * join :: AsyncA a b -> AsyncA b c -> AsyncA a (Tuple [b, c])
 *
 * Equivalent to f.then(AsyncA.returnA.fanout(g)).
 */
AsyncA.JoinThunk = function AsyncA$JoinThunk(f, g) {
    this.f = f;
    this.g = AsyncA.returnA.fanout(g);
}
AsyncA.JoinThunk.prototype = new AsyncA.ComposeThunk(null, null);
AsyncA.JoinThunk.prototype.toAString = function AsyncA$JoinThunk$prototype$toAString() {
    return "(" + this.f.toAString() + " `join` " + this.g.toAString() + ")";
}
AsyncA.prototype.join = function AsyncA$prototype$join(g) {
    return new AsyncA.JoinThunk(this, g.AsyncA());
}
Function.prototype.join = function Function$prototype$join(g) {
    return this.AsyncA().join(g);
}

/*
 * AsyncA.prototype.repeat(): looping combinator.
 * repeat :: AsyncA a (Repeat b|Done b) -> AsyncA a b
 *
 * Puts an arrow into a loop, while allowing the UI to remain responsive. The arrow should return either
 * Repeat(x) or Done(x), to repeat or exit the loop respectively.
 *
 * Signals progress when the loop completes.
 */
function Repeat() {
    return TaggedTupleFactory(arguments, this, Repeat);
}
Repeat.prototype.toString = function Repeat$prototype$toString() {
    return "[Repeat " + this.value + "]";
}

function Done() {
    return TaggedTupleFactory(arguments, this, Done);
}
Done.prototype.toString = function Done$prototype$toString() {
    return "[Done " + this.value + "]";
}

AsyncA.RepeatThunk = function AsyncA$RepeatThunk(f) {
    this.f = f;
}
AsyncA.RepeatThunk.prototype = new AsyncA(function AsyncA$RepeatThunk$prototype$t(x, a) {
    a.cont(x, this.f, new AsyncA.RepeatThunk.InnerThunk(this.f, a));
});
AsyncA.RepeatThunk.prototype.toAString = function AsyncA$RepeatThunk$prototype$toAString() {
    return "repeat " + this.f.toAString();
}
AsyncA.RepeatThunk.InnerThunk = function AsyncA$RepeatThunk$InnerThunk(f, a) {
    this.f = f;
    this.cancelled = false;

    var self = this;
    this.cancel = function AsyncA$RepeatThunk$InnerThunk$$cancel() {
        self.cancelled = true;
    };
    a.addCanceller(this.cancel);
}
AsyncA.RepeatThunk.InnerThunk.prototype = new AsyncA(function AsyncA$RepeatThunk$InnerThunk$prototype$t(x, a) {
    if (this.cancelled) {
        return;
    }
    if (x instanceof Repeat) {
        a.cont(x.value, this.f, this);
    } else if (x instanceof Done) {
        a.advance(this.cancel);
        a.cont(x.value);
    } else {
        throw new TypeError("Repeat or Done?");
    }
});
AsyncA.RepeatThunk.InnerThunk.prototype.toAString = function AsyncA$RepeatThunk$InnerThunk$prototype$toAString() {
    return "repeatinner " + this.f.toAString();
}

AsyncA.prototype.repeat = function AsyncA$prototype$repeat() {
    return new AsyncA.RepeatThunk(this);
}
Function.prototype.repeat = function Function$prototype$repeat() {
    return this.AsyncA().repeat();
}

/*
 * AsyncA.prototype.animate(): animating operator.
 * animate :: AsyncA a (Repeat b|Done b) -> Integer? -> AsyncA a b
 *
 * Like repeat, puts an arrow into a loop, but yields to the UI thread at every iteration. This is useful for animation
 * as it limits the loop to the event update rate (typically 100Hz). The arrow should return either Repeat(x) or
 * Done(x), to repeat or exit the loop respectively.
 *
 * Signals progress at every iteration.
 *
 * Note: don't use animate if a momentary delay is undesirable, such as when reinstalling an EventA arrow, since this
 * may result in a momentary (visible) loss in event tracking (e.g., during mousemove events with the mouse button down
 * (dragging), the delay causes text to be momentarily selected).
 */
AsyncA.AnimateThunk = function AsyncA$AnimateThunk(f, interval) {
    this.f = f;
    this.interval = interval || 0;
}
AsyncA.AnimateThunk.prototype = new AsyncA(function AsyncA$AnimateThunk$prototype$t(x, a) {
    a.cont(Repeat(x), new AsyncA.AnimateThunk.InnerThunk(this.f, this.interval));
});
AsyncA.AnimateThunk.prototype.toAString = function AsyncA$AnimateThunk$prototype$toAString() {
    return "animate " + this.f.toAString();
}
AsyncA.AnimateThunk.InnerThunk = function AsyncA$AnimateThunk$InnerThunk(f, interval) {
    this.f = f;
    this.interval = interval;
}
AsyncA.AnimateThunk.InnerThunk.prototype = new AsyncA(function AsyncA$AnimateThunk$InnerThunk$prototype$t(x, a) {
    if (x instanceof Repeat) {
        var self = this;
        var timerid = setTimeout(function AsyncA$AnimateThunk$InnerThunk$prototype$t$$timer() {
            a.advance(self.cancel);
            a.cont(x.value, self.f, self);
        }, this.interval);
        this.cancel = function AsyncA$AnimateThunk$InnerThunk$prototype$t$$cancel() {
            clearTimeout(timerid);
        }
        a.addCanceller(this.cancel);
    } else if (x instanceof Done) {
        a.advance(this.cancel);
        a.cont(x.value);
    } else {
        throw new TypeError("Repeat or Done?");
    }
});
AsyncA.AnimateThunk.InnerThunk.prototype.toAString = function AsyncA$AnimateThunk$InnerThunk$prototype$toAString() {
    return "animateinner " + this.f.toAString();
}

AsyncA.prototype.animate = function AsyncA$prototype$animate(interval) {
    return new AsyncA.AnimateThunk(this, interval);
}
Function.prototype.animate = function Function$prototype$animate(interval) {
    return this.AsyncA().animate(interval);
}

/*
 * AsyncA.prototype.or(): either-or combinator.
 * or :: AsyncA a b -> AsyncA a b -> AsyncA a b
 *
 * Given two AsyncA arrows, create a composite arrow that allow only one of the components, whichever is the first to
 * trigger, to execute. The other arrow will be cancelled.
 *
 */
AsyncA.OrThunk = function AsyncA$OrThunk(trigger, f, g) {
    this.f = f;
    this.g = g;
    /* allow trigger to be blank string "" (undefined == null) */
    this.trigger = (trigger == null ? "progress" : trigger);
}
AsyncA.OrThunk.prototype = new AsyncA(function AsyncA$OrThunk$prototype$t(x, a) {
    var p1, p2;
    var cancel = function AsyncA$OrThunk$prototype$t$$cancel() {
        p1.cancel();
        p2.cancel();
    }
    a.addCanceller(cancel);

    /* start p1 and p2 in parallel; since nested arrows will not run until the parent arrow has completed/timed-out,
     * there's no worry about p2 running after p1 has completed/triggered (and thus cannot cancel p2). */
    p1 = this.f.compose(Arr(function AsyncA$OrThunk$prototype$t$$p1(y) {
        p2.cancel(); /* terminate p2 when p1 has completed */
        a.advance(cancel);
        a.cont(y);
    })).run(x);
    p1.compose(EventA(this.trigger)).compose(Arr(function AsyncA$OrThunk$prototype$t$$p1$done() {
        p2.cancel(); /* terminate p2 when p1 has triggered */
    })).run();

    p2 = this.g.compose(Arr(function AsyncA$OrThunk$prototype$t$$p2(y) {
        p1.cancel(); /* terminate p1 when p2 has completed */
        a.advance(cancel);
        a.cont(y);
    })).run(x);
    p2.compose(EventA(this.trigger)).compose(Arr(function AsyncA$OrThunk$prototype$t$$p2$done() {
        p1.cancel(); /* terminate p1 when p2 has triggered */
    })).run();
});
AsyncA.OrThunk.prototype.toAString = function AsyncA$OrThunk$prototype$toAString() {
    return "(" + this.f.toAString() + " or'" + this.trigger + " " + this.g.toAString() + ")";
}

AsyncA.prototype.or = function AsyncA$prototype$or(g, h) {
    if (h === undefined) {
        return new AsyncA.OrThunk(null, this, g.AsyncA());
    } else {
        return new AsyncA.OrThunk(g, this, h.AsyncA());
    }
}
Function.prototype.or = function Function$prototype$or(g, h) {
    return this.AsyncA().or(g, h);
}

/*
 * ConstA: arrows that return a constant.
 * ConstA :: Tuple -> AsyncA _ Tuple
 */
function ConstA() {
    var args = Tuple.fromArray(arguments);
    return Arr(function ConstA$$const() { return args; });
}

/*
 * DelayA: arrows to insert a delay, given in milliseconds.
 * DelayA :: Integer -> AsyncA a a
 */
function DelayA(delay) {
    if (!(this instanceof DelayA))
        return new DelayA(delay);
    this.delay = delay;
}
DelayA.prototype = new AsyncA(function DelayA$prototype$t(data, a) {
    var self = this;
    var timerid = setTimeout(function DelayA$prototype$t$$timer() {
        a.advance(cancel);
        a.cont(data);
    }, this.delay);
    var cancel = function DelayA$prototype$t$$cancel() {
        clearTimeout(timerid);
    }
    a.addCanceller(cancel);
});
DelayA.prototype.toAString = function DelayA$prototype$toAString() {
    return "DelayA(" + this.delay + ")";
}

/*
 * EventA: arrows for event handling on HTML elements, constructed on AsyncA, with support for progress and
 * cancellation.
 * EventA :: String -> AsyncA EventTarget Event
 *
 * When run, EventA installs an event handler on the input and waits for the event. When it fires, it then uninstalls
 * the event handler and passes the event object to the next arrow.
 */
function EventA(eventname) {
    if (!(this instanceof EventA))
        return new EventA(eventname);
    this.eventname = eventname;
}
EventA.prototype = new AsyncA(function EventA$prototype$t(target, a) {
    var eventname = this.eventname;
    var cancel = function EventA$prototype$t$$cancel() {
        target.removeEventListener(eventname, handler, false);
    }
    var handler = function EventA$prototype$t$$handler(event) {
        cancel();
        a.advance(cancel);
        a.cont(event);
    }
    a.addCanceller(cancel);
    target.addEventListener(eventname, handler, false);
});
EventA.prototype.toAString = function EventA$prototype$toAString() {
    return "EventA(\"" + this.eventname + "\")";
}

/*
 * ListenA: arrows for event handling from nodejs EventEmitter, constructed on AsyncA, with support for progress and
 * cancellation.
 * ListenA :: String -> AsyncA EventTarget Event
 *
 * When run, ListenA installs an event handler on the input (an emitter) and waits for the event. When it fires, it then uninstalls
 * the event handler and passes the emitted event on to the next arrow.
 */
function ListenA(eventname) {
    if (!(this instanceof ListenA))
        return new ListenA(eventname);
    this.eventname = eventname;
}
ListenA.prototype = new AsyncA(function ListenA$prototype$t(emitter, a) {
    var eventname = this.eventname;

    var cancel = function ListenA$prototype$t$$cancel() {
        emitter.removeListener(eventname, listener);
    }
    var listener = function ListenA$prototype$t$$listener(event) {
        cancel();
        a.advance(cancel);
        a.cont(event);
    }
    a.addCanceller(cancel);
    emitter.addListener(eventname, listener);
});
ListenA.prototype.toAString = function ListenA$prototype$toAString() {
    return "ListenA(\"" + this.eventname + "\")";
}

/*
 * ListenA: arrows for event handling from nodejs EventEmitter, constructed on AsyncA, with support for progress and
 * cancellation.
 * ListenA :: String -> AsyncA EventTarget Event
 *
 * When run, ListenA installs an event handler on the input (an emitter) and waits for the event. When it fires, it then uninstalls
 * the event handler and passes the emitted event on to the next arrow.
 */
function Listen2(eventname) {
    if (!(this instanceof Listen2))
        return new Listen2(eventname);
    this.eventname = eventname;
}
Listen2.prototype = new AsyncA(function Listen2$prototype$t(tuple, a) {
    var eventname = this.eventname,
    	emitter = tuple.components['0'];

    var cancel = function Listen2$prototype$t$$cancel() {
        emitter.removeListener(eventname, listener);
    }
    var listener = function Listen2$prototype$t$$listener(event) {
    	emitter.eventData = event;
        cancel();
        a.advance(cancel);
        a.cont(tuple);
    }
    a.addCanceller(cancel);
    emitter.addListener(eventname, listener);
});
Listen2.prototype.toAString = function Listen2$prototype$toAString() {
    return "Listen2(\"" + this.eventname + "\")";
}

// When run, ListenWithValueA installs an event handler on the input (an emitter) and waits for the event that
// has the eventName that was passed in.
// When it fires, it check the specified property on the event to see if it has the needed value.
// if it does, it then uninstalls
// the event handler and passes the emitted event on to the next arrow.
function ListenWithValueA(eventname, propertyname, value) {
    if (!(this instanceof ListenWithValueA))
        return new ListenWithValueA(eventname, propertyname, value);
    this.eventname = eventname;
    this.propertyname = propertyname;
    this.value = value;
}
ListenWithValueA.prototype = new AsyncA(function ListenWithValueA$prototype$t(tuple, a) {
	// the value of 'this' depends on how a function is called, 
	// so store the value of this in the property 'that' 
	// in this closure so that we can get to it from cancel and listener
    var eventname = this.eventname,
    	propertyname = this.propertyname,
    	value = this.value,
    	emitter = tuple.components['0'];
	
	// cancel just removes the listener from the emitter
    var cancel = function ListenWithValueA$prototype$t$$cancel() {
        emitter.removeListener(eventname, listener);
    }
    
    // the listener examines the property, and if the value matches
    // we advance
    var listener = function ListenWithValueA$prototype$t$$listener(event) {
    	// check the property on the event and see if it is the value we're looking for
    	if (event[propertyname] === value) {
    		// if we get the right value, cancel this arrow
    		// advance and pass the event to the next arrow
    		emitter.eventData = event;
			cancel();
			a.advance(cancel);
			a.cont(tuple);
        }
    }
    
    a.addCanceller(cancel);
    emitter.addListener(eventname, listener);
});
ListenWithValueA.prototype.toAString = function ListenWithValueA$prototype$toAString() {
    return "ListenWithValueA(" + this.eventName + ' ' + this.property + ' ' + this.value + ")";
}

exports.Box = Box;
exports.Tuple = Tuple;
exports.Pair = Pair;
exports.Repeat = Repeat;
exports.Done = Done;
exports.ConstA = ConstA;
exports.DelayA = DelayA;
//exports.ListenA = ListenA;
exports.ListenA = Listen2;
exports.ListenWithValueA = ListenWithValueA;