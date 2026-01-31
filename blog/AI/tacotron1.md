[TOC]

# tacotron1

## 简介
&#8195;&#8195;总得来说TTS现流行的做法是：文字->embed->mel spectrongram->wav，训练的就是embed->mel spectrongram的网络。至于mel spectrongram->wav可以用一些比较流程的声码器比如waveglow、wavenet、wavernn等，也可以用传统的griffin_lim算法，griffin_lim虽然效果差了点，但可用于快速验证。下面开始进入正题：tacotron1。
&#8195;&#8195;2017年Google发表的一篇论文[TACOTRON: TOWARDS END-TO-END SPEECH SYNTHESIS](https://arxiv.org/abs/1703.10135)在TTS语音合成领域有着里程碑式的意义。它采用神经网络进行帧级别的TTS合成，与当时其他的TTS模型相比无论在质量和速度上均有着较大幅度的提升。

## 模型结构
&#8195;&#8195;Tacotron1模型相当精简，大致可以分为encoder，decoder，postnet三个部分。encoder对text进行embed核心是CBHG模块。decoder进行embed到mel spectrongram的转换核心是注意力机制attention模块，同时为加快训练过程再decoder模块使用了teacherforcing。postnet进行mel spectrongram到频谱的转换核心是CBHG模块。整个Tacotron1网络训练的是生成的梅尔谱、频谱和实际梅尔谱、频谱的loss。
<center>![图像风格迁移](http://www.aiecent.com/img/31.png)</center>

## CBHG模块
&#8195;&#8195;CBHG模块真是满满的细节。输入input首先通过K组卷积模块（提取特征+模拟K-gram）将结果cat在一起后取maxpool（增加局部不变性）。再进行2次卷积之后残差链接原始输入（深层网络使用Residual Network能解决网络梯度消失问题）后通过highway net（个人理解通过sigmoid控制input和fc（input）在输出中的占比，与Residual Network功能类似），最后通过双向GRU获取文本隐藏层
<center>![图像风格迁移](http://www.aiecent.com/img/32.png)</center>

## Attention模块
&#8195;&#8195;Attention模块的本质就是对齐。Tacotron是帧级别的语音合成，这里Attention模块的作用就是将相应帧与encoder的输出进行对齐。可以看到关键参数分别是decoder_input, memory对应上一帧梅尔谱输出和encoder模块的output。经典Attention模块需要query，key，value三个参数,这三个参数可分别从GRUCell(decoder_input),fc(memory),memory中获得。d_t_prime是所需的当前帧注意力文本了，然后再经过Residual GRU将d_t_prime转变为真实的当前帧，递归forward就可以实现整句话的文本转语音。

```python
class AttentionDecoder(nn.Module):
    def __init__(self, num_units):
      ....
    def forward(self, decoder_input, memory, attn_hidden, gru1_hidden, gru2_hidden):
        memory_len = memory.size()[1
        batch_size = memory.size()[0]

        # Get keys
        keys = self.W1(memory.contiguous().view(-1, self.num_units))
        keys = keys.view(-1, memory_len, self.num_units)

        # Get hidden state (query) passed through GRUcell
        d_t = self.attn_grucell(decoder_input, attn_hidden)
        
        # Duplicate query with same dimension of keys for matrix operation (Speed up)
        d_t_duplicate = self.W2(d_t).unsqueeze(1).expand_as(memory)

        # Calculate attention score and get attention weights
        attn_weights = self.v(torch.tanh(keys + d_t_duplicate).view(-1, self.num_units)).view(-1, memory_len, 1)
        attn_weights = attn_weights.squeeze(2)
        attn_weights = F.softmax(attn_weights,dim=1)

        # Concatenate with original query
        d_t_prime = torch.bmm(attn_weights.view([batch_size,1,-1]), memory).squeeze(1)

        # Residual GRU
        gru1_input = self.attn_projection(torch.cat([d_t, d_t_prime], 1))
        gru1_hidden = self.gru1(gru1_input, gru1_hidden)
        gru2_input = gru1_input + gru1_hidden

        gru2_hidden = self.gru2(gru2_input, gru2_hidden)
        bf_out = gru2_input + gru2_hidden
        # Output
        output = self.out(bf_out).view(-1, hp.num_mels, hp.outputs_per_step)
        return output, d_t, gru1_hidden, gru2_hidden
```

## 总结
&#8195;&#8195;原始的Tacotron1模型确实非常简洁而且行之有效，但是个人觉得还有两个问题没有解决(后期的变种版本好像已经解决)：  
* 长文本和短文本明显会产生不同长度的语音，但是在inference过程中并没有体现截断或者说break。
* Attention模块只有pre_mel_frame和encoder output两个输入，虽然经过漫长的train能学习到梅尔谱和encoder output的对齐关系，但是否可以像Transformer模型一样加入文本的位置信息，从而加速Attention模块的收敛。