[TOC]

# LANGUAGE TRANSLATION

## 简介
自Google发表了transformer之后，机器翻译领域终于迎来了质的飞跃。pytorch官网正好有一段使用transformer的德语转英语的现成demo，简单整理run一下，看看效果。  

## Code
首先看数据处理，采用multi30k数据集，spacy作为德语和英语的分词工具。dataset的处理主要有三步：首先spacy分词，然后根据词表转为对应tensor，最后增加句子BOS/EOS标志
![Local image](data/posts/img/38.png)
而model本身就是对标准transformer的简单封装并没有什么特别的地方。
![Local image](data/posts/img/39.png)
下面是直接使用demo训练出来的结果，可以看到总共150次epoch的过程中，loss下降还是非常明显的。可能测试句就是训练集中的句子以及德语与英语语法相似等诸多原因，在40轮epoch之后已经基本确定测试句对应的英文翻译。
![Local image](data/posts/img/40.png)
![Local image](data/posts/img/41.png)
![Local image](data/posts/img/42.png)
同样的代码，简单修改一下试试中英翻译，翻译的句子是“今晚有篮球赛”。在训练了500epoch之后毫无效果，可能原因有：1使用中文分词词表量巨大，最后linear layer需要更多的时间训练，2中英文语法相差大，3官方demo只是简单实现。下次可以换个翻译模型再试验一下