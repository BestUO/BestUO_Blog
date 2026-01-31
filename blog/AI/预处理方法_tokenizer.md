[TOC]

# preprocess之tokenizer

## 简介
&#8195;&#8195;距离上次发布TTS相关的心得已经2月有余，最近终于闲了下来有时间研究一下NMT（Neural Machine Translate）。使用facebook的mbart模型，在官方给出的预训练模型参数的基础上再训练48小时后查看效果一团糟，记录之。
&#8195;&#8195;先简单介绍一下mbart模型。在bart模型的基础增加的多国语言参数就是mbart模型。按照论文中的说法，bart综合了bert的bidirectional encode以及gpt的left-to-right decoder，是个实打实的好模型。感兴趣的可以搜索论文[BART: Denoising Sequence-to-Sequence Pre-training for Natural Language Generation, Translation, and Comprehension](https://arxiv.org/abs/1910.13461)。进入正题，翻译效果不忍直视，猜测至少受3个原因影响：  
* batchsize太小。当batchsize设置为16时，运行时候会报显存不足的错误，所以设置成了8。现在想想batchsize设置成8肯定会影响翻译效果，而显存不足很大概率是某些超长语句引起的。  
* NMT属于seq2seq势必存在对齐问题，模型翻译效果差很大原因就是对不齐。想到上一篇文章中介绍的tacotron2模型也存在对齐问题，真是折磨。考虑通过优化中文的tokenizer加快对齐。  
* 训练时长不够，其实在训练48小时后loss曲线仍然在下降，但是效果没预计的好直接ctrl+c了。  
&#8195;&#8195;问题2就是本篇文章要介绍的重点了，也是一个炒冷饭的东西：分词。

## 分词算法
### BPE（Byte Pair Encoding）
&#8195;&#8195;来自2016年的论文[Neural Machine Translation of Rare Words with Subword Units](https://arxiv.org/abs/1508.07909)，[github代码实现](https://github.com/rsennrich/subword-nmt)  
&#8195;&#8195;为了将一段英文转为token，可以采用Character-level或者word-level。前者虽然能表示所有的单词，但是粒度太细，训练速度慢效果差。后者如果词典小容易出现out of vocab的情况。BPE解决的就是这个问题，BPE会根据词频生成一个介于Character-level和word-level之间的词典，输入的英文单词根据新生成的词典分词。BPE算法流程：  
* 确定subword词表大小  
* 统计每一个连续字节对的出现频率，并保存为code_file。  
* 将单词拆分为字符序列并在末尾添加后缀“ </w>”，而后按照code_file合并新的subword，首先合并频率出现最高的字节对。 例如单词birthday，分割为['b', 'i', 'r', 't', 'h', 'd', 'a', 'y</w>']，查code_file，发现'th'出现的最多，那么合并为['b', 'i', 'r', 'th', 'd', 'a', 'y</w>']，最后，字符序列合并为['birth', 'day</w>']。 然后去除'</w>',变为['birth', 'day']，将这两个词添加到词表。 这个是apply-bpe完成。  
* 重复第3步直到达到第2步设定的subword词表大小或下一个最高频的字节对出现频率为1

&#8195;&#8195;训练英文版傲慢与偏见：
<center>![图像风格迁移](http://www.aiecent.com/img/44.png)</center>
<center>![图像风格迁移](http://www.aiecent.com/img/45.png)</center>
&#8195;&#8195;测试结果：
<center>![图像风格迁移](http://www.aiecent.com/img/46.png)</center>
<center>![图像风格迁移](http://www.aiecent.com/img/47.png)</center>

### [BPEmb](www.bpemb.h-its.org)
&#8195;&#8195;给笔者的感觉是产品化的bpe，访问官网可能需要一点技术手段，这里贴上截图。可以看到目前为止已经支持了275种语言，并且我大中华汉语也赫然在列。
<center>![图像风格迁移](http://www.aiecent.com/img/48.png)</center>
&#8195;&#8195;附上官方用例，可能是训练集的原因，看效果比subword-nmt好：
<center>![图像风格迁移](http://www.aiecent.com/img/49.png)</center>

### Unigram Language Model
&#8195;&#8195;在2018年google的[Subword Regularization: Improving Neural Network Translation Models with Multiple Subword Candidates](https://arxiv.org/abs/1804.10959)中被提出。核心算法与BPE相似，只是在BPE中会合并频率出现最高的字节对，而在unigram中根据会根据最大期望值算法选择性的drop：
<center>![图像风格迁移](http://www.aiecent.com/img/50.png)</center>
<center>![图像风格迁移](http://www.aiecent.com/img/51.png)</center>
&#8195;&#8195;unigram langeage model是基于概率语言模型来实现的，因此在分词效果上更符合人的直觉

### WordPiece
&#8195;&#8195;WordPiece也是一种针对英文的分词方法。词缀在英文中是判断词性、时态的关键因素，而wordpiece的作用就是将一个英文单词分成词根+词缀的形式。
<center>![图像风格迁移](http://www.aiecent.com/img/52.png)</center>
&#8195;&#8195;wordpiece可以看成是BPE和unigram langeage model的综合算法。unigram langeage model需要一个大的种子词汇然后根据最大期望值算法不断的drop直到满足条件，所以他的词汇表是减过程。而WordPiece和PBE的词汇表是不断加的过程。WordPiece和PBE不同的地方在于BPE合并频率出现最高的字节对，而WordPiece效仿unigram langeage model会基于似然而不是最高频率对形成新的subword
&#8195;&#8195;在BertTokenizer的实现中，首先进行了basictokenizer操作，主要功能是去特殊符号、大小写转换、按空格分词、去重音操作。接着进行wordpiece操作。wordpiecetokenizer就是根据已知的vocab进行查找，进而将orig word切成词根、词性的形式，对应上述subword-nmt中apple_pbe.py的实现，真正wordpiece算法的核心还是vocab如何生成。[官方示例](https://github.com/tensorflow/text/tree/master/tensorflow_text/tools/wordpiece_vocab)。

### SentencePiece
&#8195;&#8195;来自论文[SentencePiece: A simple and language independent subword tokenizer and detokenizer for Neural Text Processing](https://arxiv.org/abs/1808.06226)。SentencePiece与其说是一种算法，不如说是一个BPE和unigram的封装库，用在T5，XLNET，Transformer-XL等模型中。
&#8195;&#8195;SentencePiece主要解决tokenizer不同语言的问题。比如英文通过空格做split中文则是方块字，针对这两种语言需要不同的处理规则。SentencePiece通过使用unicode编码解决上述问题，并且在算法速度上做了优化以便满足端到端模型的需求。照着官网教程使用英文小说进行vocab生成和短句的tokenizer效果还行，后面可以替换为中文。
<center>![图像风格迁移](http://www.aiecent.com/img/53.png)</center>
<center>![图像风格迁移](http://www.aiecent.com/img/54.png)</center>

### 结巴分词
&#8195;&#8195;专门针对汉语的分词器，非常好用。功能很多，包括但不限于分词、自定义词典、关键词提取、词性标注功能。
<center>![图像风格迁移](http://www.aiecent.com/img/55.png)</center>

### [Spacy](https://spacy.io/)
&#8195;&#8195;功能包括但不限于支持多国语言、分词、词性标注、词干化、命名实体识别、名词短语提取，不多说直接上干货
<center>![图像风格迁移](http://www.aiecent.com/img/56.png)</center>