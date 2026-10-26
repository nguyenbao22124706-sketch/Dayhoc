'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function luminance(hex) {
  const nums = hex.match(/[0-9a-f]{2}/ig).map(n => parseInt(n, 16) / 255);
  const linear = nums.map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}
function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
test('màu chữ chính và phụ đạt độ tương phản WCAG AA trên thẻ sáng/tối', () => {
  for (const [fg, bg] of [
    ['#e6efff', '#182b4f'],['#bfd0ec', '#182b4f'],
    ['#203759', '#ffffff'],['#557094', '#ffffff'],
    ['#edf5ff', '#112444'],['#e8f2ff', '#112444']
  ]) assert.ok(ratio(fg, bg) >= 4.5, `Tương phản chưa đủ: ${fg} / ${bg}: ${ratio(fg,bg)}`);
});
test('tất cả các trang có CSS giao diện 2 chế độ; background tách khỏi form', () => {
  const names = ['index','dangky','dangnhap','hocvien','khoahoc','baihoc','thidau','bangtuanhoan','ontap','tiendo','taikhoan','dieukhoan','baomat','gioithieu'];
  for (const name of names) {
    const html = fs.readFileSync(path.join(root, `${name}.html`),'utf8');
    assert.match(html, /href="\/theme\.css"/, `Thiếu theme.css ở ${name}.html`);
    assert.match(html, /href="\/style\.css"/, `Thiếu style.css ở ${name}.html`);
  }
  for (const name of ['auth-sky.svg','auth-sky-night.svg']) assert.ok(fs.statSync(path.join(root,'assets',name)).size > 300);
});
