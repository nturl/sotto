# Paradee vs Kokoro fp32, wide eval (62 tutor-style sentences, whisper-base, PREPARED=1)

Caveat: paradee ran on 1-thread onnxruntime-web wasm, fp32 on multi-thread onnxruntime-node, so RTF is not like-for-like.

| model | n | mean WER | median | WER>0.2 | synth s | audio s | RTF (synth/audio) |
|---|---|---|---|---|---|---|---|
| paradee | 62 | 0.069 | 0.000 | 4 | 43 | 251 | 0.17 |
| fp32 | 62 | 0.062 | 0.000 | 4 | 64 | 253 | 0.25 |

Paradee WER exceeds fp32 by >0.1:

| id | paradee WER | fp32 WER | paradee heard | fp32 heard |
|---|---|---|---|---|
| c2 | 0.154 | 0 | In Spanish you don't save I am hungry. You save I have hunger. | In Spanish you don't say I am hungry. You say I have hunger. |
| c4 | 0.462 | 0.154 | We save our problemer, not for our problemer, even though it ends in A. | We say L-problema, not L-problema, even though it ends in A. |
| w2 | 0.167 | 0 | The French word-floupe means wolf. | The French word loup means wolf. |
| w7 | 0.167 | 0 | The Spanish word molino means windmull. | The Spanish word molino means windmill. |

4 sentences.
