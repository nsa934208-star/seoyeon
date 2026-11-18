/* 작은 템플릿 렌더러: {{값}}, <sc-if>, <sc-for>, onClick/onChange 를 처리해요 */
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SILENT = false;
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  var WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;
  function interp(str, scope) {
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }
  function attrValue(raw, scope) {
    var m = raw.match(WHOLE);
    return m ? lookup(m[1], scope) : interp(raw, scope);
  }
  function renderChildren(src, scope, parent, inSvg) {
    src.childNodes.forEach(function (n) { renderNode(n, scope, parent, inSvg); });
  }
  function renderNode(n, scope, parent, inSvg) {
    if (n.nodeType === 3) { parent.appendChild(document.createTextNode(interp(n.nodeValue, scope))); return; }
    if (n.nodeType !== 1) return;
    var tag = n.tagName.toLowerCase();
    if (tag === 'sc-if') {
      if (attrValue(n.getAttribute('value') || '', scope)) renderChildren(n, scope, parent, inSvg);
      return;
    }
    if (tag === 'sc-for') {
      var list = attrValue(n.getAttribute('list') || '', scope) || [];
      var as = n.getAttribute('as') || 'item';
      list.forEach(function (item, i) {
        var s = Object.create(scope); s[as] = item; s.$index = i;
        renderChildren(n, s, parent, inSvg);
      });
      return;
    }
    var svg = inSvg || tag === 'svg';
    var el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    var deferred = {};
    Array.prototype.forEach.call(n.attributes, function (a) {
      var name = a.name;
      if (name.indexOf('hint-') === 0) return;
      if (/^on[a-z]+$/i.test(name)) {
        var fn = attrValue(a.value, scope);
        if (typeof fn === 'function') {
          var ev = name.slice(2).toLowerCase();
          var type = (n.getAttribute('type') || 'text').toLowerCase();
          var typing = ev === 'change' && (tag === 'textarea' || (tag === 'input' && ['checkbox', 'radio', 'file'].indexOf(type) < 0));
          if (typing) {
            el.addEventListener('input', function (e) { SILENT = true; try { fn(e); } finally { SILENT = false; } });
          } else {
            el.addEventListener(ev, fn);
          }
        }
        return;
      }
      var val = attrValue(a.value, scope);
      if (name === 'value' || name === 'checked') { deferred[name] = val; return; }
      if (val === false || val == null) return;
      el.setAttribute(name, val === true ? 'true' : String(val));
    });
    renderChildren(n, scope, el, svg);
    if ('value' in deferred) el.value = deferred.value == null ? '' : deferred.value;
    if ('checked' in deferred) el.checked = !!deferred.checked;
    parent.appendChild(el);
  }

  window.DCLogic = function DCLogic(props) { this.props = props || {}; this.state = {}; };
  window.DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, next);
    if (this._schedule) this._schedule();
  };
  window.DCLogic.prototype.forceUpdate = function () { if (this._schedule) this._schedule(); };

  window.mountDC = function (Component, props, tplEl, root) {
    var inst = new Component(props);
    var pending = false;
    function draw() {
      pending = false;
      var frag = document.createDocumentFragment();
      renderChildren(tplEl.content, inst.renderVals(), frag, false);
      root.replaceChildren(frag);
    }
    inst._schedule = function () { if (SILENT) return; if (!pending) { pending = true; Promise.resolve().then(draw); } };
    draw();
  };
})();
