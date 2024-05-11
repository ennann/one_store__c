// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient } = require('../utils');
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  logger.info(`${new Date()} 消息卡片内容生成器函数开始执行...`);
  // https://open.feishu.cn/document/server-docs/im-v1/message-content-description/create_json#45e0953e
  // https://open.feishu.cn/document/server-docs/im-v1/message/create?appId=cli_a68809f3b7f9500d

  const { message_def, group } = params;
  logger.info(params);
  const groupIds = group.map(item => item._id);
  const chats = await application.data.object("object_feishu_chat")
    .where({
      _id: application.operator.in(groupIds.join(","))
    }).select("chat_id").find();
  const chatIds = chats.map(i => i.chat_id);
  logger.info({ groupIds, chatIds, ids: groupIds.join(',') });

  const client = await newLarkClient({ userId: context.user._id }, logger);

  const getImageKey = async (images) => {
    const res = await client.im.image.create({
      data: {
        image_type: "message",
        image: images[0]
      }
    })
    logger.info(res);
  };

  const getContent = async (type) => {
    // 对消息类型进行判断
    switch (type) {
      case 'option_rich_text':
        // 富文本类型消息
        const postData = transformRichText(message_def.message_richtext.raw);
        return {
          msg_type: "post",
          content: JSON.stringify(postData)
        };
      case 'option_video':
        // 视频类型消息直接发成文本类型
        const textObj = { text: `${message_def.video_content} ${message_def.video_url}` }
        return {
          msg_type: "text",
          content: JSON.stringify(textObj)
        };
      case 'option_card':
        // 消息卡片模板类型消息
        const data = {
          type: 'template',
          data: {
            template_id: message_def.message_template_id,
          }
        };
        return {
          msg_type: "interactive",
          content: JSON.stringify(data)
        };
      default:
        // 图片类型
        await getImageKey(message_def.images);
        return {
          msg_type: "image",
          content: JSON.stringify({ image_key: message_def.images[0].token })
        };
    };
  }

  const res = await getContent(message_def.option_message_type);
  const paramsData = {
    ...res,
    receive_id: chatIds[0],
    receive_id_type: "chat_id"
  };
  logger.info(JSON.stringify(paramsData, 0, 2));

  try {
    await faas.function('MessageCardSend').invoke({ ...paramsData });
  } catch (error) {
    throw new Error(error)
  }
};

// 转换富文本
const transformRichText = (html) => {
  const content = [];

  const getTag = (content) => {
    if (/<a/.test(content)) {
      return "a";
    }
    if (/<img/.test(content)) {
      return "img"
    }
    return "text"
  };

  // 匹配所有<div>标签并提取其内容和样式
  const divRegex = /<div[^>]*>(.*?)<\/div>/g;
  let match;
  while ((match = divRegex.exec(html)) !== null) {
    const divContent = match[1].trim();
    if (divContent !== "") {
      const element = [];
      let style = [];

      // 检查是否包含样式
      if (/<b>/.test(divContent)) style.push("bold");
      if (/<i>/.test(divContent)) style.push("italic");
      if (/<u>/.test(divContent)) style.push("underline");
      if (/<s>/.test(divContent)) style.push("lineThrough");
      // if (/<img/.test(divContent)) style.push("image");

      // 提取文本内容
      const text = divContent.replace(/<\/?[^>]+(>|$)/g, "");
      if (text !== "") {
        let data = { tag: getTag(divContent), text };
        if (style.length > 0) {
          data = { ...data, style };
        }
        if (/<a/.test(divContent)) {
          const matchHref = divContent.match(/href=\"(.*?)\"/);
          data = { ...data, href: matchHref[1] };
        }
        element.push(data);
      }

      if (element.length > 0) {
        content.push(element);
      }
    }
  }
  console.log({ content });
  return { zh_cn: { content } };
};