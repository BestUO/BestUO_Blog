[TOC]

# 使用griffinlim从梅尔谱重建语音信号

## 简介

&#8195;&#8195;人类对频率的感知并不是线性的，并且对低频信号的感知要比高频信号敏感。而梅尔标度(the Mel Scale)是Hz的非线性变换，对于以mel scale为单位的信号，可以做到人们对于相同频率差别的信号的感知能力几乎相同，因此Mel频率符合人类听觉感知。在机器学习中，通过对梅尔谱的训练学习可以实现voice recognize,TTS,ASR等多种任务。
vocoder模型例如wavenet,waveglow等可以通过梅尔谱重建语音信号，而传统的则可以通过griffin_lim算法重建语音信号，虽然最终效果没有使用模型理想，但胜在方便快捷。

## 基础知识

[傅里叶变换](https://zhuanlan.zhihu.com/p/19763358) 
[梅尔频率](https://blog.csdn.net/zouxy09/article/details/9156785/)  
### 声谱->梅尔谱
* stft(y)  
* Filter bank  
* dot  
### 梅尔谱->声谱
* pinv(Filter bank)  
* dot  
* griffin_lim

## 说明

&#8195;&#8195;此次测试未对音频做预处理，音频文件的预处理包括但不限于  

* 去除前后静音  
* 去噪(noisereduce)  
* 预加重  
* 归一化  

## 原始音频

&#8195;&#8195;统一使用sample_rate=22050,n_fft=1024处理

```python
def testmeltransfer():
    y, sr = librosa.load("./audio/demo.wav",sr=22050)
    fromlibrosa(y, sr, 1024)
    fromgit(y, sr)
    fromtorchaudio(y, sr, 1024)
```
<audio id="audio" controls="" preload="none">
      <source id="wav" src="http://www.aiecent.com/audio/demo.wav">
</audio>

## [librosa](http://librosa.org/doc/latest/index.html)

&#8195;&#8195;展示原始音频波形图，经梅尔变换->音频重建后的波形图，DB显示原始频谱，DB显示梅尔谱
<center>![](http://www.aiecent.com/img/fromlibrosa.jpg)</center>

<audio id="audio" controls="" preload="none">
      <source id="wav" src="http://www.aiecent.com/audio/librosa.wav">
</audio>

```python
def fromlibrosa(y, sr, n_fft):
    # audio = librosa.effects.trim(audio,  frame_length=n_fft, hop_length=n_fft//4)[0]
    # audio = librosa.effects.preemphasis(audio) #预加重
    D = librosa.stft(y,n_fft=n_fft)
    S_full, phase = librosa.magphase(D)
    S_orig = librosa.amplitude_to_db(S_full, ref=np.max)

    M = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=80, n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4,fmax=7600,fmin=125)
    # or
    # D = librosa.stft(y, n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4,center=True,window="hann",pad_mode="constant")
    # S1, phase = librosa.magphase(D,power=2)
    # mel_basis = librosa.filters.mel(sr=sr, n_fft=n_fft,n_mels=80,fmax=7600,fmin=125)
    # M1 = np.einsum("...ft,mf->...mt", S1, mel_basis, optimize=True)

    S_mel = librosa.power_to_db(M, ref=np.max)

    mel_y = librosa.feature.inverse.mel_to_audio(M,sr=sr,n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4,fmax=7600,fmin=125)
    # or
    # stft = librosa.feature.inverse.mel_to_stft(M, sr=sr, n_fft=n_fft,fmax=7600,fmin=125, power=2)
    # mel_y2 = librosa.feature.inverse.griffinlim(stft,hop_length=n_fft//4,win_length=n_fft,n_fft=n_fft,n_iter=32,
    #     window="hann",center=True,dtype=np.float32, length=None, pad_mode="constant")

    # mel_y = librosa.effects.deemphasis(mel_y)
    # sd.play(mel_y, sr)
    sf.write('audio/librosa.wav', mel_y, sr, subtype='PCM_24')
    

    fig, ax = plt.subplots(nrows = 4,sharex = True)
    librosa.display.waveshow(y,sr=sr, x_axis='time', ax=ax[0])
    ax[0].set(title="original audio")
    ax[0].label_outer()

    librosa.display.waveshow(mel_y, sr=sr, x_axis='time', ax=ax[1])
    ax[1].set(title="mel2wav audio")
    ax[1].label_outer()

    librosa.display.specshow(S_orig, y_axis='log', x_axis='time', sr=sr,  ax=ax[2],
    n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4, fmax=7600, fmin=125)
    ax[2].set(title="original log spectrogram")
    ax[2].label_outer()

    img = librosa.display.specshow(S_mel, y_axis='mel', x_axis='time', sr=sr, ax=ax[3],
    n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4, fmax=7600, fmin=125)
    ax[3].set(title="melspectrogram")

    fig.suptitle("fromlibrosa")
    fig.colorbar(img, ax=ax, format="%+2.f dB")
    plt.savefig("audio/fromlibrosa.jpg")
    plt.show()

```

## [torchaudio](https://pytorch.org/audio/stable/torchaudio.html)

&#8195;&#8195;展示原始音频波形图，经梅尔变换->音频重建后的波形图，DB显示原始频谱，DB显示梅尔谱
<center>![](http://www.aiecent.com/img/fromtorchaudio.jpg)</center>
&#8195;&#8195;这里重建的音频文件有很强的电流声，经过试验由torchaudio.transforms.InverseMelScale函数引起的。后期可以考虑通过对音频文件去噪，或者直接通过vocode模型过滤掉。

<audio id="audio" controls="" preload="none">
      <source id="wav" src="http://www.aiecent.com/audio/torchaudio.wav">
</audio>

```python
def fromtorchaudio(y, sr, n_fft):
    import torch
    import torchaudio

    # linear_spectrogram = spectrogramtransform(torch.from_numpy(y))
    transform = torchaudio.transforms.Spectrogram(n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4)
    linear_spectrogram = transform(torch.from_numpy(y))

    transform = torchaudio.transforms.MelSpectrogram(sample_rate=sr, n_mels=80, 
    n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4, f_max=7600, f_min=125)
    mel_spectrogram = transform(torch.from_numpy(y))  # (channel, n_mels, time)

    transform = torchaudio.transforms.InverseMelScale(sample_rate=sr, n_stft=n_fft//2+1, n_mels=80, f_max=7600, f_min=125)
    spectrogram = transform(mel_spectrogram)

    # transform = torchaudio.transforms.InverseSpectrogram(n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4)
    # isp = torch.tensor(isp,dtype=torch.cdouble)
    # y = transform(isp)

    transform = torchaudio.transforms.GriffinLim(n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4)
    mel_audio = transform(spectrogram)
    sf.write('audio/torchaudio.wav', mel_audio, sr, subtype='PCM_24')
    
    # mel_audio2 = librosa.feature.inverse.mel_to_audio(mel_spectrogram.numpy(),sr=sr,n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4,fmax=7600,fmin=125)
    # mel_audio2 = librosa.feature.inverse.griffinlim(spectrogram.numpy(),n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4)
    # sf.write('audio/torchaudio2.wav', mel_audio2, sr, subtype='PCM_24')

    fig, ax = plt.subplots(nrows = 4,sharex = True)
    librosa.display.waveshow(y,sr=sr, x_axis='time', ax=ax[0])
    ax[0].set(title="original audio")
    ax[0].label_outer()

    librosa.display.waveshow(mel_audio.numpy(),sr=sr, x_axis='time', ax=ax[1])
    ax[1].set(title="mel2wav audio")
    ax[1].label_outer()

    img = librosa.display.specshow(linear_spectrogram.log2().numpy(), y_axis='log', x_axis='time', sr=sr,  ax=ax[2],
    n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4, fmax=7600, fmin=125)
    ax[2].set(title="original log spectrogram")
    ax[2].label_outer()

    img = librosa.display.specshow(mel_spectrogram.log2().numpy(), y_axis='mel', x_axis='time', sr=sr, ax=ax[3],
    n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4, fmax=7600, fmin=125)
    ax[3].set(title="melspectrogram")

    fig.suptitle("fromtorchaudio")
    fig.colorbar(img, ax=ax, format="%+2.f dB")
    plt.savefig("audio/fromtorchaudio.jpg")
    plt.show()
```

## [某github代码](https://github.com/luolinll1212/Griffin-Lim.tutorial)

&#8195;&#8195;展示原始音频波形图，经梅尔变换->音频重建后的波形图，DB显示原始频谱，DB显示梅尔谱
<center>![](http://www.aiecent.com/img/fromgit.jpg)</center>

<audio id="audio" controls="" preload="none">
      <source id="wav" src="http://www.aiecent.com/audio/git.wav">
</audio>

```python
def fromgit(y, sr):
    import GriffinLim.utils.audio as audio
    from GriffinLim.hparams import hparams as hps
    n_fft = hps.n_fft

    # y = audio.trim_silence(y, hps)

    linear_spectrogram = audio.linearspectrogram(y, hps).astype(np.float32)
    mel_spectrogram = audio.melspectrogram(y, hps).astype(np.float32)

    mel_audio = audio.inv_mel_spectrogram(mel_spectrogram, hps)
    # sd.play(audio, sr)
    sf.write('audio/git.wav', y, sr, subtype='PCM_24')

    fig, ax = plt.subplots(nrows = 4,sharex = True)
    librosa.display.waveshow(y,sr=sr, x_axis='time', ax=ax[0])
    ax[0].set(title="original audio")
    ax[0].label_outer()

    librosa.display.waveshow(mel_audio,sr=sr, x_axis='time', ax=ax[1])
    ax[1].set(title="mel2wav audio")
    ax[1].label_outer()

    librosa.display.specshow(linear_spectrogram, y_axis='log', x_axis='time', sr=sr,  ax=ax[2],
    n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4, fmax=7600, fmin=125)
    ax[2].set(title="original log spectrogram")
    ax[2].label_outer()

    img = librosa.display.specshow(mel_spectrogram, y_axis='mel', x_axis='time', sr=sr, ax=ax[3],
    n_fft=n_fft, win_length=n_fft, hop_length=n_fft//4, fmax=7600, fmin=125)
    ax[3].set(title="melspectrogram")

    fig.suptitle("fromgit")
    fig.colorbar(img, ax=ax, format="%+2.f dB")
    plt.savefig("audio/fromgit.jpg")
    plt.show()

```