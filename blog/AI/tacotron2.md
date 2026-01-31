[TOC]

# tacotron2

## 简介
&#8195;&#8195;Tacotron2基于论文[NATURAL TTS SYNTHESIS BY CONDITIONING WAVENET ON MEL SPECTROGRAM PREDICTIONS](https://ieeexplore.ieee.org/document/8461368)。是作者学习的第一篇机器学习论文，算算也有一年多了。同Tacotron1一样Tacotron2的功能是TTS，不同的是2代摒弃了CBHG结构，使模型更加简洁有效。具体实现细节这里不细说感兴趣的可以看论文或者[nvidia的官方实现](https://github.com/NVIDIA/tacotron2)。

## 模型结构
<center>![图像风格迁移](http://www.aiecent.com/img/36.png)</center>

## Pytorch官网代码
```python
import torch

tacotron2 = torch.hub.load('NVIDIA/DeepLearningExamples:torchhub', 'nvidia_tacotron2', model_math='fp16')
tacotron2 = tacotron2.to('cuda')
tacotron2.eval()

waveglow = torch.hub.load('NVIDIA/DeepLearningExamples:torchhub', 'nvidia_waveglow', model_math='fp16')
waveglow = waveglow.remove_weightnorm(waveglow)
waveglow = waveglow.to('cuda')
waveglow.eval()

text = 'what a lovey day'
utils = torch.hub.load('NVIDIA/DeepLearningExamples:torchhub', 'nvidia_tts_utils')
sequences, lengths = utils.prepare_input_sequence([text])
with torch.no_grad():
    mel, _, _ = tacotron2.infer(sequences, lengths)
    audio = waveglow.infer(mel)
audio_numpy = audio[0].data.cpu().numpy()

rate = 22050
from scipy.io.wavfile import write
write('audio.wav', rate, audio_numpy)
```

## 一个大问题
&#8195;&#8195;以上代码直接使用官网给的模型进行预测效果理想。但作者在从头开始训练过程中遇到了一个大问题，自始至终也没有解决:train过程中语音的合成的效果非常好，但是inference完全失败。通过28000个item后输出的alignment可以猜想模型的attention模块失效了。至于原因大概是模型使用teacherforcing，合成结果太依赖真实帧导致attention模块不能从中学到语音帧和文本之间的对齐关系。
<center>![图像风格迁移](http://www.aiecent.com/img/37.png)</center>

## 方案：
* 看见有人一直训练到10W+次才看到alignment有对角化的趋势，所以可以尝试减小学习率继续训练下去。这种方法太费时间了，放弃。
* 目前的prenet输出128维，修改为32或者64减小audio frames的信息量强制模型预测更多依赖text embedding。作者试了，效果不甚理想。
* 将模型teacherforcing模式修改为按比例的teacherforcing。作者试了，也没能从根本上解决问题。
* 论文[MAXIMIZING MUTUAL INFORMATION FOR TACOTRON](https://arxiv.org/abs/1909.01145)主要提出了两种方法
    * drop frames。与上述中的3类似，不再复述。
    * strengthen the dependency between the predicted acoustic features and the input text with mutual information，灵感来源InfoGan。这里需要用到CTC("Connectionist Temporal classification: labeling Unsegmented Sequence Data with Recurrent Neural Networks")，用以解决神经网络数据的label标签和网络预测数据output不能对齐的情况，正好能解作者目前遇到的窘境。CTC的论文已经放弃了完全不懂，感兴趣的自己查了研究下。幸运的是pytorch1.0以后已经集成了CTCloss，可以直接使用。

## 最终解决方案
&#8195;&#8195;用mutual information+CTCLoss修改Tacoctron2模型原有的loss函数，等闲下来了再试一次