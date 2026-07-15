# Face-embedding model (MobileFaceNet)

No `.tflite` model is bundled in this repo: the commonly redistributed
`mobile_face_net.tflite` binaries come from repositories without a license,
and the Apache-2.0 MobileFaceNet sources only publish TF checkpoints.
Without a model the app falls back to a **clearly-marked placeholder
embedding** (`src/face/embedFace.ts`, method `'stub'`) — fine for exercising
the pipeline against the mock server, but it is *not* real face recognition.

## Enabling real embeddings

Obtain a MobileFaceNet TFLite model (input `1x112x112x3` float32, output a
128/192-d embedding). Options:

- Convert `sirius-ai/MobileFaceNet_TF` (Apache-2.0) to TFLite with the
  TensorFlow converter.
- Use any other MobileFaceNet/FaceNet `.tflite` whose license you accept.

Then place it in the app's **documents directory** on the device at:

```
<documentDirectory>/models/mobilefacenet.tflite
```

e.g. on Android with a dev build:

```sh
adb shell mkdir -p /data/data/<applicationId>/files/models
adb push mobilefacenet.tflite /data/data/<applicationId>/files/models/
```

The app probes this path on the first face-embedding run and switches to real
TFLite embeddings automatically (log line: `[face] loaded MobileFaceNet
TFLite model`). Alternatively, drop the file in this folder and change
`embedFace.ts` to `loadTensorflowModel(require('../../assets/models/mobilefacenet.tflite'), [])`
— `metro.config.js` already registers `.tflite` as an asset extension.

Note: embeddings are tagged with the method that produced them (`tflite` vs
`stub`) and only compared same-method, so enrollments made with the stub will
show as "Placeholder embedding" in Settings and should be re-enrolled after
switching to a real model.
