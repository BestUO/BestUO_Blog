[TOC]

# SV2TTS

## 简介
&#8195;&#8195;Google2018年发表的论文[Transfer Learning from Speaker Verification to Multispeaker Text-To-Speech Synthesis](https://arxiv.org/abs/1806.04558)可以实现VoiceClone，实时复刻任意一个人的声音。功能实现依赖3个大模块，Speaker Encoer、Tacotron1、Vocoder。上篇文章已经介绍过Tacotron1了，这里不再重复，Vocoder也不训练还是用griffin_lim进行验证。
&#8195;&#8195;SpeakerEncoer的核心是GE2E，根据Google2017年的一篇论文[GENERALIZED END-TO-END LOSS FOR SPEAKER VERIFICATION](https://arxiv.org/abs/1710.10467)而来。这篇论文提出一种新的损失函数，通过这种loss进行backforward能快速区分不同说话者，将同一说话者的语音聚集到一个区，从而提取不同说话者的embedvector。把不同说话者的embedvector作为一个参数塞入到tacotron模型中再进行TTS训练就能实现VoiceClone。

## GE2E结构
<center>![图像风格迁移](http://www.aiecent.com/img/33.png)</center>
&#8195;&#8195;个人理解：GE2E认为不同speaker的不同utterance的特征都分布在同一个特征空间中，并且同一speaker的utterance特征可以被聚类，那么各个人声特征中心是不同的，每个说话人embedvector中心为：
<center>![图像风格迁移](http://www.aiecent.com/img/34.png)</center>
&#8195;&#8195;接着GE2E设计了一个相似矩阵S，其中的Sjik表征第j个说话者的第i句话和第k个说话者中心Ck的相似度，如上图最右侧的矩阵
<center>![图像风格迁移](http://www.aiecent.com/img/35.png)</center>
&#8195;&#8195;在原论文中作者还设计了两种loss，分别在Text-independent和Text-dependent条件下有着不同的效果，而在SV2TTS项目中直接使用nn.CrossEntropyLoss作为损失函数，将实际求得的similarity_matrix与理想中的similarity_matrix进行比较，SV2TTS中相似矩阵的实现如下：

```python
def similarity_matrix(self, embeds):
    """
    Computes the similarity matrix according the section 2.1 of GE2E.

    :param embeds: the embeddings as a tensor of shape (speakers_per_batch, 
    utterances_per_speaker, embedding_size)
    :return: the similarity matrix as a tensor of shape (speakers_per_batch,
    utterances_per_speaker, speakers_per_batch)
    """
    speakers_per_batch, utterances_per_speaker = embeds.shape[:2]
    
    # Inclusive centroids (1 per speaker). Cloning is needed for reverse differentiation
    centroids_incl = torch.mean(embeds, dim=1, keepdim=True)
    centroids_incl = centroids_incl.clone() / (torch.norm(centroids_incl, dim=2, keepdim=True) + 1e-5)

    # Exclusive centroids (1 per utterance)
    centroids_excl = (torch.sum(embeds, dim=1, keepdim=True) - embeds)
    centroids_excl /= (utterances_per_speaker - 1)
    centroids_excl = centroids_excl.clone() / (torch.norm(centroids_excl, dim=2, keepdim=True) + 1e-5)

    # Similarity matrix. The cosine similarity of already 2-normed vectors is simply the dot
    # product of these vectors (which is just an element-wise multiplication reduced by a sum).
    # We vectorize the computation for efficiency.
    sim_matrix = torch.zeros(speakers_per_batch, utterances_per_speaker,
                             speakers_per_batch).to(self.loss_device)
    mask_matrix = 1 - np.eye(speakers_per_batch, dtype=np.int)
    for j in range(speakers_per_batch):
        mask = np.where(mask_matrix[j])[0]
        sim_matrix[mask, :, j] = (embeds[mask] * centroids_incl[j]).sum(dim=2)
        sim_matrix[j, :, j] = (embeds[j] * centroids_excl[j]).sum(dim=1)

    sim_matrix = sim_matrix * self.similarity_weight + self.similarity_bias
    return sim_matrix
```

## 一点想法
* 既然GE2E在多人声特征提取上有这么大的优势，理论上也可以用在文本分类上。参考作者之前发的文章[零基础入门NLP2](http://www.aiecent.com/articleDetail?article_id=37)，通过用GE2E替代loss函数应该能加快训练速度和准确度，等有时间的时候尝试一下。
* 参考作者之前的另外两篇文章[图像的风格迁移1](http://www.aiecent.com/articleDetail?article_id=31)、[图像的风格迁移2](http://www.aiecent.com/articleDetail?article_id=39)，在图像处理中可以通过Gram矩阵、正态化风格特征、WCT等方法提取风格特征。那么不同的人声也可以认为是不同的风格，有没有一种方法可以提取这种人声的风格特征，然后应用到不同的声音上呢？基频包含音调信息，频谱包络包含语义和音色信息，非周期性指数包含声带振动或噪音混合的影响，理论上通过这三个参数就可以还原出一段语音。
* Google在生成中间tacotron阶段并入了speakerembed，理论上在vocoder阶段也可以并入。通过做动态时间归正（DWT）对齐原始音频与目标音频的帧数据,再通过speakerembed进行原始音频到目标音频的转变。Google为什么没有选择这样做，或许有他的考量吧，这里暂且只提一个想法。
* 项目代码参考[Real-Time-Voice-Cloning](https://github.com/CorentinJ/Real-Time-Voice-Cloning)。可惜的是我一共训练了两次，第一次成功第二次失败了，考虑到tacotron毕竟出了第二代，就不继续深究。