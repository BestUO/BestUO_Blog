[TOC]

# Attention is all need拙见+Pytorch代码解读

## 简介
&#8195;&#8195;在google的这篇文章之前，nlp任务中主流的序列转换模型都是基于CNN或者RNN，而[Attention is all you need](https://arxiv.org/abs/1706.03762)提出了一种仅基于注意力机制的简单网络Transform。实验证明这种简单网络不仅大大提高了模型预测的准确率，同时也极大缩减了训练时间，简直妙不可言

## Transform模型
<center>![Transform模型](http://www.aiecent.com/img/9.webp)</center>
&#8195;&#8195;左边encoder：首先input经过context embedding以及positional encoding，然后进入encoder主体。encoder由N=6个相同的层组成,图中仅展示了一个。每层有两个子层,第一个子层是multi-head self-attention,第二个子层是全连接层,每个子层均采用residual connection + layer normalization。看一下代码：

## Encoder
```python
class Encoder(nn.Module):
    ''' A encoder model with self attention mechanism. '''
    def __init__(
            self, n_src_vocab, d_word_vec, n_layers, n_head, d_k, d_v,
            d_model, d_inner, pad_idx, dropout=0.1, n_position=200):
        super().__init__()

        self.src_word_emb = nn.Embedding(n_src_vocab, d_word_vec, padding_idx=pad_idx)
        self.position_enc = PositionalEncoding(d_word_vec, n_position=n_position)
        self.dropout = nn.Dropout(p=dropout)
        self.layer_stack = nn.ModuleList([
            EncoderLayer(d_model, d_inner, n_head, d_k, d_v, dropout=dropout)
            for _ in range(n_layers)])
        self.layer_norm = nn.LayerNorm(d_model, eps=1e-6)

    def forward(self, src_seq, src_mask, return_attns=False):
        enc_slf_attn_list = []
        enc_output = self.dropout(self.position_enc(self.src_word_emb(src_seq)))
        enc_output = self.layer_norm(enc_output)

        for enc_layer in self.layer_stack:
            enc_output, enc_slf_attn = enc_layer(enc_output, slf_attn_mask=src_mask)
            enc_slf_attn_list += [enc_slf_attn] if return_attns else []

        if return_attns:
            return enc_output, enc_slf_attn_list
        return enc_output,
```
&#8195;&#8195;line11~13:创建6个相同的EncoderLayer层
&#8195;&#8195;line18~19:context embedding+positional encoding+dropout+LayerNorm。positional encoding是一个很巧妙的设计，nlp任务中一句话中的词序是很重要的信息，而此处的positional encoding很巧妙的将词序信息转化为了向量信息叠加到了input中，之后会对positional encoding进行代码解读。这里为啥用LayerNorm？根据经验nlp任务用LayerNorm效果好，cv用BatchNorm效果好。
&#8195;&#8195;line21~23：encoder主体，输出的enc_output继续作为enc_layer的输入，for循环结束后最终的enc_output作为decoder的其中一个输入。

### positional encoding
&#8195;&#8195;先看一下positional encoding的核心算法，pos是字符的位置i是维度,同时因为使用了正余弦函数，PE也能表征相对位置信息
<center>![](http://www.aiecent.com/img/10.webp)</center>
<center>![](http://www.aiecent.com/img/11.webp)</center>
PE能把位置信息分散在0~1之间，但是不能区分方向
<center>![](http://www.aiecent.com/img/12.webp)</center>

```python
class PositionalEncoding(nn.Module):
    def __init__(self, d_hid, n_position=200):
        super(PositionalEncoding, self).__init__()
        # Not a parameter
        self.register_buffer('pos_table', self._get_sinusoid_encoding_table(n_position, d_hid))

    def _get_sinusoid_encoding_table(self, n_position, d_hid):
        ''' Sinusoid position encoding table '''
        # TODO: make it with torch instead of numpy
        def get_position_angle_vec(position):
            return [position / np.power(10000, 2 * (hid_j // 2) / d_hid) for hid_j in range(d_hid)]

        sinusoid_table = np.array([get_position_angle_vec(pos_i) for pos_i in range(n_position)])
        sinusoid_table[:, 0::2] = np.sin(sinusoid_table[:, 0::2])  # dim 2i
        sinusoid_table[:, 1::2] = np.cos(sinusoid_table[:, 1::2])  # dim 2i+1

        return torch.FloatTensor(sinusoid_table).unsqueeze(0)

    def forward(self, x):
        return x + self.pos_table[:, :x.size(1)].clone().detach()
```

### EncoderLayer
&#8195;&#8195;PositionwiseFeedForward由2个fc+relu激活+dropout+残差连接+LayerNorm构成
```python
class EncoderLayer(nn.Module):
    ''' Compose with two layers '''
    def __init__(self, d_model, d_inner, n_head, d_k, d_v, dropout=0.1):
        super(EncoderLayer, self).__init__()
        self.slf_attn = MultiHeadAttention(n_head, d_model, d_k, d_v, dropout=dropout)
        self.pos_ffn = PositionwiseFeedForward(d_model, d_inner, dropout=dropout)

    def forward(self, enc_input, slf_attn_mask=None):
        enc_output, enc_slf_attn = self.slf_attn(
            enc_input, enc_input, enc_input, mask=slf_attn_mask)
        enc_output = self.pos_ffn(enc_output)
        return enc_output, enc_slf_attn
```

### Attention model
&#8195;&#8195;算法核心注意力机制：MultiHeadAttention。关于注意力机制知乎的这篇文章写得挺好<https://zhuanlan.zhihu.com/p/48508221> 。MultiHeadAttention就是多个self-attention。可以这么理解，单个self-attention可以在子空间里学习某一相关的信息，而MultiHeadAttention就是单个self-attention的简单叠加，可以学习到多个相关信息。
<center>![](http://www.aiecent.com/img/13.webp)</center>
<center>![](http://www.aiecent.com/img/14.webp)</center>

```python
class ScaledDotProductAttention(nn.Module):
    ''' Scaled Dot-Product Attention '''
    def __init__(self, temperature, attn_dropout=0.1):
        super().__init__()
        self.temperature = temperature
        self.dropout = nn.Dropout(attn_dropout)

    def forward(self, q, k, v, mask=None):
        attn = torch.matmul(q / self.temperature, k.transpose(2, 3))
        if mask is not None:
            attn = attn.masked_fill(mask == 0, -1e9)

        attn = self.dropout(F.softmax(attn, dim=-1))
        output = torch.matmul(attn, v)
        return output, attn
```

## Decoder
Transform结构总的右半部分为decoder模块，仅与encoder模块有轻微差别，除了对decode的输入进行attention计算外还要将结果cat上encode的输出进行attention，核心都是MultiHeadAttention

```python
class Decoder(nn.Module):
    ''' A decoder model with self attention mechanism. '''
    def __init__(
            self, n_trg_vocab, d_word_vec, n_layers, n_head, d_k, d_v,
            d_model, d_inner, pad_idx, n_position=200, dropout=0.1):
        super().__init__()

        self.trg_word_emb = nn.Embedding(n_trg_vocab, d_word_vec, padding_idx=pad_idx)
        self.position_enc = PositionalEncoding(d_word_vec, n_position=n_position)
        self.dropout = nn.Dropout(p=dropout)
        self.layer_stack = nn.ModuleList([
            DecoderLayer(d_model, d_inner, n_head, d_k, d_v, dropout=dropout)
            for _ in range(n_layers)])
        self.layer_norm = nn.LayerNorm(d_model, eps=1e-6)

    def forward(self, trg_seq, trg_mask, enc_output, src_mask, return_attns=False):
        dec_slf_attn_list, dec_enc_attn_list = [], []
        # -- Forward
        dec_output = self.dropout(self.position_enc(self.trg_word_emb(trg_seq)))
        dec_output = self.layer_norm(dec_output)

        for dec_layer in self.layer_stack:
            dec_output, dec_slf_attn, dec_enc_attn = dec_layer(
                dec_output, enc_output, slf_attn_mask=trg_mask, dec_enc_attn_mask=src_mask)
            dec_slf_attn_list += [dec_slf_attn] if return_attns else []
            dec_enc_attn_list += [dec_enc_attn] if return_attns else []

        if return_attns:
            return dec_output, dec_slf_attn_list, dec_enc_attn_list
        return dec_output,

class DecoderLayer(nn.Module):
    ''' Compose with three layers '''
    def __init__(self, d_model, d_inner, n_head, d_k, d_v, dropout=0.1):
        super(DecoderLayer, self).__init__()
        self.slf_attn = MultiHeadAttention(n_head, d_model, d_k, d_v, dropout=dropout)
        self.enc_attn = MultiHeadAttention(n_head, d_model, d_k, d_v, dropout=dropout)
        self.pos_ffn = PositionwiseFeedForward(d_model, d_inner, dropout=dropout)

    def forward(
            self, dec_input, enc_output,
            slf_attn_mask=None, dec_enc_attn_mask=None):
        dec_output, dec_slf_attn = self.slf_attn(
            dec_input, dec_input, dec_input, mask=slf_attn_mask)
        dec_output, dec_enc_attn = self.enc_attn(
            dec_output, enc_output, enc_output, mask=dec_enc_attn_mask)
        dec_output = self.pos_ffn(dec_output)
        return dec_output, dec_slf_attn, dec_enc_attn
```

&#8195;&#8195;至此[Attention is all you need](https://arxiv.org/abs/1706.03762)核心模块都已简单介绍完毕