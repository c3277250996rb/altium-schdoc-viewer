---
name: export-tab-csv-toggle
description: 隐藏或恢复 Webview 工具栏 Export tab CSV 按钮时使用。记录最小改动做法（exportCsv.hidden = true）、为何保留每页签绑定、以及验证步骤（工具栏只剩 Direct Export、切页签仍 display:none）。
---

# Export tab CSV 按钮的隐藏 / 恢复

## 位置

`src/editor/webview/main.ts` → `render()` 内工具栏构造处：

```ts
const exportCsv = el('button', 'btn', 'Export tab CSV') as HTMLButtonElement;
// Hidden on request: the per-tab bindings below stay in place, only the button is not shown.
exportCsv.hidden = true;
toolbar.appendChild(exportCsv);
```

配合的两套既有逻辑都**保持原样、不要删**：

- 每个数据页签里的 `exportCsv.onclick = () => downloadCsv(...)` 绑定
- `renderPanel()` 里的 `exportCsv.style.display = 'none'`（Preview 页签）与 `''`（其它页签）

## 隐藏（最小改动）

只加一行：`exportCsv.hidden = true;`。元素仍创建、仍挂到工具栏，只是不渲染。

## 恢复显示

删掉 `exportCsv.hidden = true;` 这一行即可，其余代码无需改动。

## 为什么保留元素而不是删掉

删元素必须给 5 处 `exportCsv.onclick` 加可选链、并清理 3 处 `style.display`，diff 大且容易漏。保留元素时这些赋值作用在隐藏节点上，无副作用，恢复成本是一次删除一行。

## 验证

```bash
npm run demo -- test/fixtures/local-board.SchDoc demo-out light   # 重建 webview 与演示页
npm run demo:serve                                               # 可选：http://127.0.0.1:4173/
npm run typecheck
```

在页面里检查（DevTools 或浏览器自动化）：

```js
Array.from(document.querySelectorAll('.toolbar .btn')).map((b) => ({
  text: b.textContent,
  hidden: b.hidden,
  display: getComputedStyle(b).display,
}));
```

预期结果：

| 按钮 | 结果 |
|---|---|
| `Direct Export` | `hidden: false`，可见 |
| `Export tab CSV` | `hidden: true`，`display: none` |
| 切到 Preview / Nets 等页签后 | `Export tab CSV` 仍为 `display: none` |

## 注意

- 不要用 CSS 给 `.btn` 加 `display: none`：`.btn` 也用于 `Direct Export` 和 Preview 的缩放按钮。
- `hidden` 属性会被显式非 `none` 的 `style.display` 覆盖；本文件只写 `''` 和 `'none'`，所以隐藏状态稳定。
- 该按钮的隐藏属临时产品决定，README / CHANGELOG 里的描述需随之同步，避免文档与界面不符。
