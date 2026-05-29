## 目标
Paint 阶段的 "Prompt details" 折叠区改为使用真实剧本数据 `script?.shots[0]?.prompt`，而不是 `FALLBACK_PROMPT_DETAIL` 假文案。

## 改动（src/components/sc/Workspace.tsx）

1. 在组件内读取 store 中的 script：
   ```ts
   const script = useSC((s) => s.script);
   ```

2. 将 Paint stage 的 `details` 改为：
   ```tsx
   details={script?.shots?.[0]?.prompt ?? FALLBACK_PROMPT_DETAIL}
   ```
   未生成剧本时（例如示例预览）回退到原假文案，避免折叠区空白。

## 验证
- 跑 typecheck / build，确认无报错。
- 不动其它逻辑，仅前端展示绑定。