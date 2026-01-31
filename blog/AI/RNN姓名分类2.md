[TOC]

# RNN姓名分类2

## 简介
&#8195;&#8195;官方[demo](https://pytorch.org/tutorials/intermediate/char_rnn_classification_tutorial#sphx-glr-intermediate-char-rnn-classification-tutorial-py)，准确率只有58%非常不理想，本篇主题就是优化。

## 优化点1：梯度更新
&#8195;&#8195;首先优化的点是梯度更新，毕竟已经是发展了很多年的东西了，没必要自己写，除了像NVIDIA等巨头公司。之前学cv的时候看过他们开放的源码，连反向传播算法都是自己写，或许是现有的梯度更新算法无法满足他们的业务场景吧。分别使用SGD和Adam进行对比测试：
<center>![SGD和Adam对比](http://www.aiecent.com/img/5.webp)</center>
&#8195;&#8195;上图中左为使用了SGD算法后的loss曲线，右为Adam算法的loss曲线。经过30W轮训练使用了Adam算法后，模型loss值降到了1.0，而SGD仍然是1.25，看看效果:
<center>![SGD和Adam对比](http://www.aiecent.com/img/6.webp)</center>
&#8195;&#8195;两者的准确率分别为58%和67%，可以看出SGD和原版比较并没有多少差别，而Adam则是把准确率直接提升了10个点。最重要的是训练时间以及模型都没有变化，不得不仰视Adam的提出者

## 优化点2：预测模型
&#8195;&#8195;模型设计才是AI的重中之重，重要的事情说第1遍。使用torch.nn.RNN代替原预测模型，同时使用embedding代替onehot。RNN经典结构图解：
<center>![SGD和Adam对比](http://www.aiecent.com/img/7.webp)</center>

```python
class RNN2(nn.Module):
    def __init__(self, input_size, hidden_size, output_size):
        super(RNN2, self).__init__()
        self.embedding = nn.Embedding(input_size, hidden_size)
        self.rnn = nn.RNN(hidden_size,
                          hidden_size,
                          num_layers=1,
                          batch_first=True,
                          dropout=0)
        self.o2o = nn.Linear(hidden_size, output_size)
        self.softmax = nn.LogSoftmax(dim=1)

    def forward(self, input):
        output = self.embedding(input)
        outputrnn, hidden = self.rnn(output)
        output = self.o2o(hidden[-1])
        output = self.softmax(output)
        return output
```
<center>![SGD和Adam对比](http://www.aiecent.com/img/8.webp)</center>
&#8195;&#8195;简单使用LSTM做替换，模型的准确率已经直接上升到了89%，且看loss曲线准确度仍有上升的空间。  
&#8195;&#8195;模型的设计才是AI的重中之重，重要的事情说第3遍。和LSTM齐名的模型应该是GRU了，效果和LSTM差不多，但是模型参数更少。简单来说就是干一样的活，吃更少的饭！但是此处我们不讨论GRU，因为对准确率不会提升太多。  
&#8195;&#8195;对于文本的处理，Google的一篇论文[Attention is all you need](https://arxiv.org/abs/1706.03762)提出另一种玩法，留着下一期介绍。

## 总结
&#8195;&#8195;demo只是用来演示，有个重要的疏漏没有明说就是数据集。测试集和训练集用的同一批数据不符合规范。要想真正验证模型的学习能力，还是需要将数据分为训练集、验证集、测试集才行。模型优化方面也有一些固定套路，比如选择合适的激活函数、使用Kaiming或xavier模型初始化参数、增加dropout层防止模型过拟合、batchnormal防止梯度消失等