[TOC]

# RNN姓名分类1

## 简介
&#8195;&#8195;Pytorch官方[demo](https://pytorch.org/tutorials/intermediate/char_rnn_classification_tutorial#sphx-glr-intermediate-char-rnn-classification-tutorial-py)实现的基本功能：字符级的名字分类，虽然有些许瑕疵，但是用来阐述原理已经够了。机器学习标准流程：数据处理->模型预测->计算损失反向传播->梯度更新。

## 数据处理
&#8195;&#8195;demo中对name的编码采用的是onehot稀疏矩阵的形式。onehot编码在google的word2vec之前确实盛行，而word2vec则开启了embedding模式新纪元，onehot之所以被取代笔者看来: 

* 长文本的稀疏矩阵需要花费大量算力才能得到有效信息  
* onehot编码之后不包含位置信息。

```python
def letterToIndex(letter):
    return all_letters.find(letter)

# Turn a letter into a <1 x n_letters> Tensor
def letterToTensor(letter):
    tensor = torch.zeros(1, n_letters)
    tensor[0][letterToIndex(letter)] = 1
    return tensor

# Turn a line into a <line_length x 1 x n_letters>s
# official
def lineToTensor(line):
    tensor = torch.zeros(len(line), 1, n_letters)
    for li, letter in enumerate(line):
        tensor[li][0][letterToIndex(letter)] = 1
    return tensor
```

## 模型预测
&#8195;&#8195;官方的demo中并没有用到torch.nn.RNN，而是直接实现了基本结构。  
```python
class RNN(nn.Module):
    def __init__(self, input_size, hidden_size, output_size):
        super(RNN, self).__init__()
        self.hidden_size = hidden_size
        self.i2h = nn.Linear( input_size + hidden_size, hidden_size)
        self.i2o = nn.Linear( input_size + hidden_size, output_size)
        self.o2o = nn.Linear(hidden_size + output_size, output_size)
        self.softmax = nn.LogSoftmax(dim=1)

    def forward(self, input, hidden):
        input_combined = torch.cat((input, hidden), 1)
        hidden = self.i2h(input_combined)
        output = self.i2o(input_combined)
        output_combined = torch.cat((hidden, output), 1)
        output = self.o2o(output_combined)
        output = self.softmax(output)
        return output, hidden

    def initHidden(self):
        return Variable(torch.zeros(1, self.hidden_size))
```
&#8195;&#8195;图形解读一下是这样子:
<center>![RNN基本结构](http://www.aiecent.com/img/1.webp)</center>

## 计算损失反向传播
&#8195;&#8195;demo中用到了NLLLoss来计算损失。其实对于多分类问题，可以用CrossEntropyLoss来替代，两者的效果是一样的
```python
criterion = nn.NLLLoss()
loss = criterion(output, category_tensor)
loss.backward()
```
## 梯度更新
&#8195;&#8195;也是便于大家理解，官方的demo中并没有用到现成的梯度更新算法，而是简单的在梯度上加上了学习率lr，可想而知效果肯定不咋地。
```python
lr=0.005
for p in rnn.parameters():
  p.data.add_(-lr,p.grad.data)
```
## 总结
&#8195;&#8195;至此，demo中的关键部分都已经介绍完了，随机抽取1w数据看一下最终效果：准确率58%，可以看到Vietnamese和korea的分类准确度较高达到了0.8其他类别较低，但对于文本分类而言0.8依然很低，还有进一步哟花空间。
<center>![分类效果](http://www.aiecent.com/img/4.webp)</center>