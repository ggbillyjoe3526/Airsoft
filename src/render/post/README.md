# src/render/post

The post stack's plan and chain, drawn by the node renderer's passes (`webgpu/post/`). Low builds none.

- `postPlan.ts` picks the passes per preset; `postHost.ts` makes and frees the node renderer's stack; `postPass.ts` is
  what each pass may read about the frame.
- `postStack.ts` is the chain (`PostChain`) that `webgpu/post/nodePostStack.ts` runs, with its pure helpers in
  `postHelpers.ts`.
