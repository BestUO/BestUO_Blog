[TOC]
# 神经网络小Tips

## 通用套路
### 数据预处理
resize->totensor->normalize

### 模型
#### 类别
嵌入层
全链接层
卷积层
激活层
+ sigmoid
+ relu
+ softmax
dropout
#### 经典结构
rnn
cnn
lstm
#### ResNet中的残差网络
解决梯度消失
#### transform中的注意力模块

### 损失函数
#### 常用损失函数
L1Loss
均方误差MSFLoss
交叉熵损失CROSSENTROPYLOSS

### 优化器optimizer
采样梯度更新模型的可学习参数
#### 常用优化器
optim.SGD
optim.Adam


## 卷积神经网络
### 卷积核
* 1×1卷积核：跨通道聚合、降维减少模型参数
* 卷积核越大，越关注全局特征、但计算量会增加。可以用多个小卷积核替换大的。比如1个5\*5 卷积核由2个3\*3卷积核替换。即提升了网络的深度又降低参数量
```
假设输入是28x28,stride为1，padding为0：
单层5x5： 
(28-5 + 0x2) / 1 + 1=24
2层3x3的卷积核： 
第一层3x3：（28-3 + 0x2）/ 1 + 1=26
第二层3x3：（26-3 + 0x2）/ 1 + 1=24
```

## 残差网络(ResNets)
* 网络较深时无法提取到特征。而residual结构(残差结构)能解决该问题
```pytorch
class ResnetBlock(nn.Module):
    def __init__(self, dim, use_bias):
        super(ResnetBlock, self).__init__()
        conv_block = []
        conv_block += [nn.ReflectionPad2d(1),
                       nn.Conv2d(dim, dim, kernel_size=3, stride=1, padding=0, bias=use_bias),
                       nn.InstanceNorm2d(dim),
                       nn.ReLU(True)]

        conv_block += [nn.ReflectionPad2d(1),
                       nn.Conv2d(dim, dim, kernel_size=3, stride=1, padding=0, bias=use_bias),
                       nn.InstanceNorm2d(dim)]

        self.conv_block = nn.Sequential(*conv_block)

    def forward(self, x):
        out = x + self.conv_block(x)
        return out
```

## Normalization
https://zhuanlan.zhihu.com/p/142866736
https://zhuanlan.zhihu.com/p/152232203
https://blog.csdn.net/kuweicai/article/details/100110593
### Batch Normalization
* 认为数据的相同特征独立同分布，因此对同批数据的相同特征进行标准正态化
* 解决梯度消失或梯度爆,同时加快收敛

### Layer Normalization

### Instance Normalization

### Group Normalization

## 池化层
https://www.freesion.com/article/5936434427/ 根据相关理论，特征提取的误差主要来自两个方面：

* 邻域大小受限造成的估计值方差增大；
* 卷积层参数误差造成估计均值的偏移
### 平均池化层
* 取池化区域的均值
* 针对问题1，更多的保留图像的背景信息
* 保留了有关块或池中次重要元素的大量信息
### 最大池化层
* 取池化区域的最大值
* 针对问题2，更多的保留纹理信息
* 平移不变性

## 激活层
### ReLU
* 一般使用relu。做了bn之后dying relu的问题就没有了
* dcgan generator做升维，不用担心信息丢失，所以用的relu
### LeakReLU
* dcgan discriminator需要把一个图像压缩成compact feature然后分类，leakyrelu不容易丢失信息，所以accuracy会高一点点