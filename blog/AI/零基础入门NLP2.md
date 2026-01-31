[TOC]

# 零基础入门NLP2

## 简介
&#8195;&#8195;上篇文章用facebook的FastText直接进行文本分类，最终在"阿里云天池：零基础入门NLP - 新闻文本分类"比赛中的f1_score得分为0.9362，斩获72名。  
&#8195;&#8195;本篇文章将用最朴素的语言介绍方案2：基于[Hierarchical Transformers for Long Document Classification](https://www.researchgate.net/publication/339404081_Hierarchical_Transformers_for_Long_Document_Classification)的文本切片方法。使用该方法，f1_score得分提高了0.0087排名提高到53了。无图无真相，先上一张排名图镇楼。
<center>![图像风格迁移](http://www.aiecent.com/img/16.png)</center>

## 文本切片
&#8195;&#8195;由于显存大小的限制。超长文本+batch很容易就超过的单张卡的显存容量，如果靠加钱买卡来增加显存大小解决问题，方法可行但不够优雅，因此有了文本切片方法。  
&#8195;&#8195;类似于信号与系统中的卷积，通过一个滑动窗划过一个长文本。对小窗进行分类，假使一篇文章共有150个小窗，其中120个小窗属于A类，那么我们就可以大致认为这篇文章属于A类，这就是文本切片的基本原理。  
* 对原数据集处理，将文章切片作为新数据集  
* 使用新数据集训练NET1  
* 原数据集经过NET1取中间层输出结果作为NET2的输入，训练NET2  

## 实战
&#8195;&#8195;Net1直接使用Transformers中的BertForSequenceClassification
&#8195;&#8195;Net2是在BertForSequenceClassification的基础上稍作修改，将Net1中pooled_output 作为Net2的输入

```python
class ModelNet2(BertPreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        # self.device = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')
        self.num_labels = config.num_labels

        self.bert = BertModel(config)
        self.dropout = nn.Dropout(config.hidden_dropout_prob)
        self.classifier = nn.Linear(config.hidden_size, config.num_labels)
        self.init_weights()

        self.encoder = self.bert.encoder
        self.pooler = self.bert.pooler

    def forward(
        self,
        input_ids=None,
        attention_mask=None,
        token_type_ids=None,
        position_ids=None,
        head_mask=None,
        inputs_embeds=None,
        labels=None,
        output_attentions=None,
        output_hidden_states=None,
        return_dict=True,
    ):
        input_shape = input_ids.size()
        extended_attention_mask: torch.Tensor = self.get_extended_attention_mask(attention_mask, input_shape, self.device)
        head_mask = self.get_head_mask(head_mask, self.config.num_hidden_layers)

        encoder_outputs = self.encoder(
            input_ids,
            attention_mask=extended_attention_mask,
            head_mask=head_mask,
            encoder_hidden_states=None,
            encoder_attention_mask=None,
            past_key_values=None,
            use_cache=False,
            output_attentions=output_attentions,
            output_hidden_states=output_hidden_states,
            return_dict=return_dict,
        )
        sequence_output = encoder_outputs[0]
        pooled_output = self.pooler(sequence_output) if self.pooler is not None else None

        outputs = BaseModelOutputWithPoolingAndCrossAttentions(
            last_hidden_state=sequence_output,
            pooler_output=pooled_output,
            past_key_values=encoder_outputs.past_key_values,
            hidden_states=encoder_outputs.hidden_states,
            attentions=encoder_outputs.attentions,
            cross_attentions=encoder_outputs.cross_attentions,
        )

        pooled_output = outputs[1]

        pooled_output = self.dropout(pooled_output)
        logits = self.classifier(pooled_output)

        loss = None
        if labels is not None:
            if self.cc == 1:
                #  We are doing regression
                loss_fct = MSELoss()
                loss = loss_fct(logits.view(-1), labels.view(-1))
            else:
                loss_fct = CrossEntropyLoss()
                loss = loss_fct(logits.view(-1, self.num_labels), labels.view(-1))

        if not return_dict:
            output = (logits,) + outputs[2:]
            return ((loss,) + output) if loss is not None else output

        return SequenceClassifierOutput(
            loss=loss,
            logits=logits,
            hidden_states=outputs.hidden_states,
            attentions=outputs.attentions,
        )
```

## LOSS
&#8195;&#8195;训练后Net1、Net2的loss曲线
<center>![图像风格迁移](http://www.aiecent.com/img/17.png)</center>

## 优化
&#8195;&#8195;改进方法目前能想到的只有清洗数据集+Schedule了，目前不再进行进一步尝试。