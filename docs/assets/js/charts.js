/* RealCognix OS — small hand-built SVG charts */
(function () {
  'use strict';
  var RC = window.RC;
  function nice(max) { var p = Math.pow(10, Math.floor(Math.log10(max || 1))); var m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  RC.charts = {
    /* series: [{values, cls:'s1'}], labels */
    bars: function (labels, series, o) {
      o = o || {}; var W = 560, H = o.h || 200, pl = 34, pb = 22, pt = 8;
      var max = nice(Math.max.apply(null, series.reduce(function (a, s) { return a.concat(s.values); }, [])) * 1.05);
      var iw = W - pl - 4, ih = H - pb - pt, n = labels.length, gw = iw / n, bw = Math.min(18, (gw - 10) / series.length);
      var g = '';
      for (var t = 0; t <= 4; t++) { var y = pt + ih - ih * t / 4; g += '<line class="gridline" x1="' + pl + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + RC.n(Math.round(max * t / 4)) + '</text>'; }
      labels.forEach(function (l, i) {
        var x0 = pl + gw * i + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
        series.forEach(function (s, j) { var v = s.values[i], h = ih * v / max; g += '<rect class="' + (s.cls || 's' + (j + 1)) + '" x="' + (x0 + j * (bw + 2)) + '" y="' + (pt + ih - h) + '" width="' + bw + '" height="' + h + '" rx="2"><title>' + l + ': ' + RC.n(v) + '</title></rect>'; });
        g += '<text x="' + (pl + gw * i + gw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + l + '</text>';
      });
      return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g + '</svg>';
    },
    line: function (labels, series, o) {
      o = o || {}; var W = 560, H = o.h || 200, pl = 34, pb = 22, pt = 8;
      var max = nice(Math.max.apply(null, series.reduce(function (a, s) { return a.concat(s.values); }, [])) * 1.05);
      var iw = W - pl - 10, ih = H - pb - pt, n = labels.length, g = '';
      for (var t = 0; t <= 4; t++) { var y = pt + ih - ih * t / 4; g += '<line class="gridline" x1="' + pl + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + RC.n(Math.round(max * t / 4)) + '</text>'; }
      function X(i) { return pl + 5 + iw * i / (n - 1); }
      series.forEach(function (s, j) {
        var pts = s.values.map(function (v, i) { return X(i) + ',' + (pt + ih - ih * v / max); });
        g += '<polyline class="l' + (j + 1) + '" points="' + pts.join(' ') + '"/>';
        if (j < 2) pts.forEach(function (p) { var c = p.split(','); g += '<circle class="dot' + (j + 1) + '" cx="' + c[0] + '" cy="' + c[1] + '" r="2.6"/>'; });
      });
      labels.forEach(function (l, i) { g += '<text x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + l + '</text>'; });
      return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + g + '</svg>';
    },
    /* rows: [[label, value, displayValue?]] */
    hbars: function (rows, o) {
      o = o || {}; var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
      return rows.map(function (r) {
        return '<div class="hbar"><span class="muted">' + RC.esc(r[0]) + '</span><span class="track"><span style="width:' + (100 * r[1] / max).toFixed(1) + '%' + (o.color ? ';background:' + o.color : '') + '"></span></span><span class="v">' + (r[2] != null ? r[2] : r[1]) + '</span></div>';
      }).join('');
    },
    funnel: function (rows) {
      var top = rows[0][1];
      return '<div class="funnel">' + rows.map(function (r, i) {
        return '<div class="fn-row"><span class="fn-label">' + r[0] + '</span><span class="fn-bar"><span style="width:' + (100 * r[1] / top).toFixed(1) + '%"></span></span><span class="fn-val">' + RC.n(r[1]) + '</span><span class="fn-pct">' + (i ? Math.round(100 * r[1] / rows[i - 1][1]) + '%' : '') + '</span></div>';
      }).join('') + '</div>';
    },
    spark: function (values, cls) {
      var W = 100, H = 28, max = Math.max.apply(null, values), min = Math.min.apply(null, values);
      var pts = values.map(function (v, i) { return (W * i / (values.length - 1)).toFixed(1) + ',' + (H - 2 - (H - 4) * (v - min) / ((max - min) || 1)).toFixed(1); });
      return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="height:28px;width:100px"><polyline class="' + (cls || 'l1') + '" points="' + pts.join(' ') + '"/></svg>';
    }
  };
})();
