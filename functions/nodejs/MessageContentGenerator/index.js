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
  // logger.info(params);
  // 获取群ID
  const groupIds = group.map(item => item._id);
  const chats = await application.data.object("object_feishu_chat")
    .where({
      _id: application.operator.in(groupIds.join(","))
    }).select("chat_id").find();
  const chatIds = chats.map(i => i.chat_id);
  logger.info({ groupIds, chatIds, ids: groupIds.join(',') });

  const client = await newLarkClient({ userId: context.user._id }, logger);

  // 获取图片image_key
  const getImgKey = async (token) => {
    const file = await application.resources.file.download(token);
    const imageKeyRes = await client.im.image.create({
      data: {
        image_type: 'message',
        image: file,
      },
    });
    if (imageKeyRes.code && imageKeyRes.code !== 0) {
      logger.error("图片上传失败", { imageKeyRes });
      throw new Error("图片上传失败: " + imageKeyRes);
    }
    return imageKeyRes.image_key;
  };

  // 获取多张图片image_key
  const getImageKeys = async (images) => {
    const keys = [];
    for (const { token } of images) {
      const imageKey = await getImgKey(token);
      keys.push(imageKey);
    }
    return keys;
  };

  // 转换富文本
  const transformRichText = async (rich, title) => {
    const content = [];
    // 获取标签
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
    while ((match = divRegex.exec(rich.raw)) !== null) {
      const divContent = match[1].trim();
      if (divContent !== "") {
        const element = [];
        let style = [];
        // 检查是否包含样式
        if (/<b>/.test(divContent)) style.push("bold");
        if (/<i>/.test(divContent)) style.push("italic");
        if (/<u>/.test(divContent)) style.push("underline");
        if (/<s>/.test(divContent)) style.push("lineThrough");

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
    // 获取图片
    if (rich.config.length > 0) {
      const imgKeys = await getImageKeys(rich.config);
      imgKeys.map(image_key => {
        content.push(
          [{
            tag: "img",
            image_key
          }]
        )
      });
    }
    console.log({ content });
    return { zh_cn: { title, content } };
  };

  // 图片类型根据图片数量返回消息数据
  const getImgContent = async () => {
    const imageKeys = await getImageKeys(message_def.images);
    if (imageKeys.length === 1) {
      return {
        msg_type: "image",
        content: JSON.stringify({ image_key: imageKeys[0] })
      };
    }
    // 多张图片使用消息卡片模板类型
    const elements = imageKeys.map(img_key =>
    ({
      img_key,
      tag: "img",
      alt: {
        content: "",
        tag: "plain_text"
      },
    }));
    const info = {
      elements,
      header: {
        template: "turquoise",
        title: {
          content: message_def.message_title,
          tag: "plain_text"
        }
      }
    }
    return {
      msg_type: "interactive",
      content: JSON.stringify(info)
    };
  }

  // 获取消息内容
  const getContent = async (type) => {
    switch (type) {
      case 'option_rich_text':
        // 富文本类型消息
        const postData = await transformRichText(message_def.message_richtext, message_def.message_title);
        return {
          msg_type: "post",
          content: JSON.stringify(postData)
        };
      case 'option_video':
        // 视频类型消息直接发成文本类型
        const textObj = { text: `${message_def.message_title} ${message_def.video_url}` }
        return {
          msg_type: "text",
          content: JSON.stringify(textObj)
        };
      case 'option_card':
        // TODO 消息卡片模板类型消息
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
        const res = await getImgContent();
        return res;
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
    // 发送消息
    await faas.function('MessageCardSend').invoke({ ...paramsData });
  } catch (error) {
    throw new Error(error)
  }
};