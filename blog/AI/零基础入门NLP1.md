[TOC]

# 零基础入门NLP1

## 简介
&#8195;&#8195;年前参加了阿里的一个天池大赛喜获72名，截图纪念一下。截止目前可能72名也保不住了，现分享一下经验及代码
<center>![图像风格迁移](http://www.aiecent.com/img/15.png)</center>

## 赛题数据
&#8195;&#8195;训练集20w条样本，测试集A包括5w条样本，测试集B包括5w条样本，整合划分出14个候选分类类别。比赛数据的文本按照字符级别进行了匿名处理，换句话说就是数据集已经做了word to index。

## 使用bert
&#8195;&#8195;直接上bert毕竟有现成的代码，结果悲剧，报了这么个错：RuntimeError: Creating MTGP constants failed. 简单搜了一下bert中的Position Embedding把文本长度限制在了512。想想也是，先不说超长文本进入bert网络后需要申请的内存显存资源，光执行注意力机制需要的计算资源也是无法想象的，毕竟注意力机制的直观理解就是对齐，在字符级的文本中，其时间复杂度达到On^2。

## Fasttext
&#8195;&#8195;如果对准确度没有那么高要求的话，fasttext完全能胜任简单的文本分类工作，甚至在某些场景里其准确度完全不输bert这种重量级nlp模型。  
* 适合大型数据+高效的训练速度：能够训练模型“在使用标准多核CPU的情况下10分钟内处理超过10亿个词汇”，特别是与深度模型对比，fastText能将训练时间由数天缩短到几秒钟。使用一个标准多核 CPU，得到了在10分钟内训练完超过10亿词汇量模型的结果。此外， fastText还能在五分钟内将50万个句子分成超过30万个类别。  
* fastText专注于文本分类，在许多标准问题上实现当下最好的表现（例如文本倾向性分析或标签预测）  
* 支持多语言表达：利用其语言形态结构，fastText能够被设计用来支持包括英语、德语、西班牙语、法语以及捷克语等多种语言。它还使用了一种简单高效的纳入子信息的方式，在用于像捷克语这样词态丰富的语言时，这种方式表现得非常好，这也证明了精心设计的字符 n-gram 特征是丰富词汇表征的重要来源。FastText的性能要比时下流行的word2vec工具明显好上不少，也比其他目前最先进的词态词汇表征要好。  
* 比word2vec更考虑了相似性，比如 fastText 的词嵌入学习能够考虑 english-born 和 british-born 之间有相同的后缀，但 word2vec 却不能

```python
import fasttext
if __name__=="__main__":
    trainfile=r"train.txt"
    testfile=r"test.txt"
    #fasttext.supervised():有监督的学习
    classifier=fasttext.train_supervised(trainfile,label='__label__', dim=300, epoch=200,
                                         lr=1, wordNgrams=6, loss="hs")
    classifier.save_model("fasttext.model")

    # print("训练集")
    # result = classifier.test(trainfile)
    # print("测试量: ",result[0])
    # print("准确率: ",result[1])
    # print("召回率: ",result[2])

    print("测试集")
    result = classifier.test(testfile)
    print("测试量: ",result[0])
    print("准确率: ",result[1])
    print("召回率: ",result[2])
```

## 文本切片
&#8195;&#8195;基于[Hierarchical Transformers for Long Document Classification](https://www.researchgate.net/publication/339404081_Hierarchical_Transformers_for_Long_Document_Classification)的文本切片方法。首先切割文本，将切割出的句子加上label以及元句子序号单独分离成一条数据进入bert进行训练（个人理解就是用bert进行一个词向量训练）。一个长句切割成3个短句进入训练完的bert模型后bert输出的三个隐藏层，将这3个隐藏层拼接（相当于对短句做了一次embedding）之后再训练下一个网路。下一个网络可以是bert、lstm，简单fc，总之下个网络的功能就是分类。关于bert的超长文本分类，这篇文章把步骤写的很详细：<https://blog.csdn.net/valleria/article/details/105311340>

## XLNet
&#8195;&#8195;略

## 大赛连接
<https://tianchi.aliyun.com/competition/entrance/531810/information>