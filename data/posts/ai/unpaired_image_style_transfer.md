[TOC]

# 非成对图像风格转换

## U-GAT-IT: Unsupervised Generative Attentional Networks with Adaptive Layer-Instance Normalization for Image-to-Image Translation
### 简介
人头像到二次元卡通图像的风格转换[paper](https://arxiv.org/pdf/1907.10830.pdf) & [code](https://github.com/znxlwm/UGATIT-pytorch)
### 创新点
* 基于辅助分类器的注意力模型
	- [G中的分类器关注原始域有而生成域没有的重要特征](https://stats.stackexchange.com/questions/471940/can-someone-explain-cam-loss-used-in-u-gat-it-paper)
	- D中的分类器关注同一域中区分真假样本的重要特征
* Adaptive Layer-Instance Normalization
	- IN更适合获得细节统计量，而LN更适合获得整体的统计量。两者结合提出adaILN
### 注意点
* [对抗网络中的鉴别器使用谱归一化函数](https://zhuanlan.zhihu.com/p/50567059)
* [鉴别器D防止梯度稀疏，使用leakrelu激活](https://www.jianshu.com/p/b06cc10575fb)
```python
class adaILN(nn.Module):
    def __init__(self, num_features, eps=1e-5):
        super(adaILN, self).__init__()
        self.eps = eps
        self.rho = Parameter(torch.Tensor(1, num_features, 1, 1))
        self.rho.data.fill_(0.9)

    def forward(self, input, gamma, beta):
        in_mean, in_var = torch.mean(input, dim=[2, 3], keepdim=True), torch.var(input, dim=[2, 3], keepdim=True)
        out_in = (input - in_mean) / torch.sqrt(in_var + self.eps)
        ln_mean, ln_var = torch.mean(input, dim=[1, 2, 3], keepdim=True), torch.var(input, dim=[1, 2, 3], keepdim=True)
        out_ln = (input - ln_mean) / torch.sqrt(ln_var + self.eps)
        out = self.rho.expand(input.shape[0], -1, -1, -1) * out_in + (1-self.rho.expand(input.shape[0], -1, -1, -1)) * out_ln
        out = out * gamma.unsqueeze(2).unsqueeze(3) + beta.unsqueeze(2).unsqueeze(3)

        return out
```
### 效果展示
<center>![A2B_UGATIT风格迁移](http://124.223.100.95:9999/img/20220710/A2B_UGATIT.png)</center>

## Photo2Cartoon
### 简介
参考U-GAT-IT，真人头像到类真人卡通图像的风格转换。[code](https://github.com/minivision-ai/photo2cartoon)
### 创新点
* 在原有4种loss的基础上增加id_loss。通过预训练的人脸识别模型来提取真人照和卡通图画的id特征，用余弦相似度求得id_loss。
* 提出Soft-AdaLIN，在decode时将不同层的特征图和最终求得的内容特征、风格特征通过均方差融合，想法和[Universal Style Transfer via Feature Transforms](https://arxiv.org/abs/1705.08086)类似。
```python
...
content_features1 = F.adaptive_avg_pool2d(x, 1).view(x.shape[0], -1)
content_features2 = F.adaptive_avg_pool2d(x, 1).view(x.shape[0], -1)
content_features3 = F.adaptive_avg_pool2d(x, 1).view(x.shape[0], -1)
content_features4 = F.adaptive_avg_pool2d(x, 1).view(x.shape[0], -1)
...
self.DecodeBlock1 = ResnetSoftAdaLINBlock(ngf*4)
self.DecodeBlock2 = ResnetSoftAdaLINBlock(ngf*4)
self.DecodeBlock3 = ResnetSoftAdaLINBlock(ngf*4)
self.DecodeBlock4 = ResnetSoftAdaLINBlock(ngf*4)
...
x = self.DecodeBlock1(x, content_features4, style_features)
x = self.DecodeBlock2(x, content_features3, style_features)
x = self.DecodeBlock3(x, content_features2, style_features)
x = self.DecodeBlock4(x, content_features1, style_features)

class ResnetSoftAdaLINBlock(nn.Module):
    def __init__(self, dim, use_bias=False):
        super(ResnetSoftAdaLINBlock, self).__init__()
        self.pad1 = nn.ReflectionPad2d(1)
        self.conv1 = nn.Conv2d(dim, dim, kernel_size=3, stride=1, padding=0, bias=use_bias)
        self.norm1 = SoftAdaLIN(dim)
        self.relu1 = nn.ReLU(True)

        self.pad2 = nn.ReflectionPad2d(1)
        self.conv2 = nn.Conv2d(dim, dim, kernel_size=3, stride=1, padding=0, bias=use_bias)
        self.norm2 = SoftAdaLIN(dim)

    def forward(self, x, content_features, style_features):
        out = self.pad1(x)
        out = self.conv1(out)
        out = self.norm1(out, content_features, style_features)
        out = self.relu1(out)

        out = self.pad2(out)
        out = self.conv2(out)
        out = self.norm2(out, content_features, style_features)
        return out + x

class SoftAdaLIN(nn.Module):
    def __init__(self, num_features, eps=1e-5):
        super(SoftAdaLIN, self).__init__()
        self.norm = adaLIN(num_features, eps)

        self.w_gamma = Parameter(torch.zeros(1, num_features))
        self.w_beta = Parameter(torch.zeros(1, num_features))

        self.c_gamma = nn.Sequential(nn.Linear(num_features, num_features),
                                     nn.ReLU(True),
                                     nn.Linear(num_features, num_features))
        self.c_beta = nn.Sequential(nn.Linear(num_features, num_features),
                                    nn.ReLU(True),
                                    nn.Linear(num_features, num_features))
        self.s_gamma = nn.Linear(num_features, num_features)
        self.s_beta = nn.Linear(num_features, num_features)

    def forward(self, x, content_features, style_features):
        content_gamma, content_beta = self.c_gamma(content_features), self.c_beta(content_features)
        style_gamma, style_beta = self.s_gamma(style_features), self.s_beta(style_features)

        w_gamma, w_beta = self.w_gamma.expand(x.shape[0], -1), self.w_beta.expand(x.shape[0], -1)
        soft_gamma = (1. - w_gamma) * style_gamma + w_gamma * content_gamma
        soft_beta = (1. - w_beta) * style_beta + w_beta * content_beta

        out = self.norm(x, soft_gamma, soft_beta)
        return out
```
* 增加hourglass模块
### 效果展示
<center>![A2B_UGATIT风格迁移](http://124.223.100.95:9999/img/20220710/A2B_photo2cartoon.png)</center>

## Few-shot Knowledge Transfer for Fine-grained Cartoon Face Generation
### 简介
上述两种模型的训练集均为女性，因此不同类人物头像的转换效果不甚理想,该论文解决了这一问题[paper](https://arxiv.org/abs/2007.13332)
### 成果
* 小样本训练集在不同类人物域之间取得了良好的迁移效果
分阶段训练，第一阶段为女性基类模型，第二阶段为不同人物域的分支模型训练。分支模型初始化为原始预训练参数，不更新群体共享的编解码器。分支模型学习特定群体的小样本特征，并更新各自的模型参数。解决不同类人物域之间的风格迁移。

## 参考
https://blog.csdn.net/iRiven/article/details/107833193
https://blog.csdn.net/qq_34914551/article/details/112641492
https://zhuanlan.zhihu.com/p/133843407
https://www.cnblogs.com/fydeblog/p/11424404.html#%E6%A8%A1%E5%9E%8B%E7%BB%93%E6%9E%84
https://www.tqwba.com/x_d/jishu/158003.html
https://zhuanlan.zhihu.com/p/50567059
https://blog.csdn.net/Yong_Qi2015/article/details/107829163