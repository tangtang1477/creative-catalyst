## 根因

`src/lib/sc/store.ts` 里 `currentUserId` 只在 **submit 那一刻** 通过 `supabase.auth.getUser()` 异步写入一次（line 1283）：

```ts
supabase.auth.getUser().then(({ data }) => {
  set({ currentUserId: data.user?.id ?? null });
});
```

问题链：

1. 用户从 `/login` 登录后回到 `/`，store 里的 `currentUserId` 仍然是 submit 时拿到的旧值（多半是 `null`，因为 submit 那一刻 session 还没恢复 / 用户当时还没登录）。
2. `runLife` 用 `get().currentUserId`（line 965）做判断 → `null` → 走「未登录」失败分支（line 971-979），标记 V01 Failed，不调用 Seedance。
3. 用户点「重试」→ `retryAsset("V01")` → `retryStage("life")` → 重新执行 `runLife`，**还是读同一个旧的 `currentUserId`** → 立刻又失败，UI 上看起来"点了没反应"（实际上是瞬间又失败成同样的文案）。
4. 同样问题影响 `runWardrobe`(line 527)、`runPaint`(line 661)，登录后重做也会卡在「未登录·使用示例图」。

另外没有任何地方订阅 `supabase.auth.onAuthStateChange`，所以登录/登出后 store 永远不会自更新。

## 改动

只动 `src/lib/sc/store.ts`，最小范围：

### 1. 全局订阅 auth 状态，写回 `currentUserId`

在 store 文件底部（创建 store 之后、模块加载时）执行一次：

```ts
if (typeof window !== "undefined") {
  // 初始恢复 session
  supabase.auth.getUser().then(({ data }) => {
    useSC.setState({ currentUserId: data.user?.id ?? null });
  });
  // 登录 / 登出 / token 刷新都同步进 store
  supabase.auth.onAuthStateChange((_e, session) => {
    useSC.setState({ currentUserId: session?.user?.id ?? null });
  });
}
```

这样登录后无需任何其它操作，store 立即拿到 userId。

### 2. 重做时**先刷新一次** userId，避免依赖旧快照

在 `retryStage`（line 1549）开头补一次拉取：

```ts
retryStage: (id) => {
  // 重做前同步一次最新登录态，避免点了重试还报「未登录」
  void supabase.auth.getUser().then(({ data }) => {
    set({ currentUserId: data.user?.id ?? null });
  });
  // ...原逻辑
}
```

并把 `runLife` / `runWardrobe` / `runPaint` 里读 `currentUserId` 的位置改成异步获取最新值（如果当前为 null，先 `await supabase.auth.getUser()` 再判断），确保即使订阅还没就绪也能在生成前再 double-check 一次。

### 3.（可选清理）submit 时不要强制把 `currentUserId` 重置为 `null`

`startNewTask`（line 1279）里 `currentUserId: null` 这一行删掉，避免每次 submit 都先把已知的 userId 清空再异步拉回来，造成第一次 `runLife` 还是看到 `null`。

## 验收

1. 在 `/login` 登录后回到 `/`，无需刷新页面，新建任务能正常生成。
2. 任意失败态点「重试」/「重做此步」：
   - 已登录 → 真实调用 Seedance（duration clamp 到 5/10s），不会再立刻报"未登录"。
   - 未登录 → 弹出失败原因 + 引导去登录，不扣积分。
3. 登出后正在进行的任务，新一步会按"未登录"逻辑友好失败而不是塞假数据。

只动 `src/lib/sc/store.ts` 一个文件。
