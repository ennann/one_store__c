// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient, createLimiter } = require('../utils');
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  logger.info(`消息卡片内容生成函数 开始执行`, params);
  // https://open.feishu.cn/document/server-docs/im-v1/message-content-description/create_json#45e0953e
  // https://open.feishu.cn/document/server-docs/im-v1/message/create?appId=cli_a68809f3b7f9500d

  const { record } = params;

  const client = await newLarkClient({ userId: context.user._id }, logger);

  // 获取图片image_key
  const getImgKey = async (token) => {
    const file = await application.resources.file.download(token);
    try {
      const imageKeyRes = await client.im.image.create({
        data: {
          image_type: 'message',
          image: file,
        },
      });
      return imageKeyRes.image_key;
    } catch (error) {
      logger.error("上传图片失败", error);
      throw new Error("上传图片失败", error);
    }
  };

  // 获取多张图片image_key
  const getImageKeys = async (images) => {
    const limitUploadImg = createLimiter(getImgKey);
    const imgUploadList = await Promise.all(images.map(item => limitUploadImg(item.token)));
    return imgUploadList.filter(imgKey => !!imgKey);
  };

  // 图片类型根据图片数量返回消息数据
  const getImgContent = async () => {
    if (!record.images || record.images.length === 0) {
      logger.error("消息定义没有图片");
      return [];
    }
    const imageKeys = await getImageKeys(record.images);
    if (imageKeys.length === 1) {
      return {
        msg_type: "image",
        content: JSON.stringify({ image_key: imageKeys[0] })
      };
    }
    // 多张图片使用消息卡片模板类型
    const elements = getCardImgElement(imageKeys);
    const info = {
      elements,
      header: {
        template: "turquoise",
        title: {
          tag: "plain_text",
          content: record.message_title,
        }
      },
    };
    logger.info({ info });
    return {
      msg_type: "interactive",
      content: JSON.stringify(info)
    };
  }

  // 转换富文本-飞书卡片类型
  const formatRichToCard = async (htmlString, title) => {
    const divs = [];
    const formattedData = [];
    let match;
    const imgRegex = /<img[^>]*src="([^"]*)"[^>]*>/g;
    const tagRegex = /<[^>]*>/g;
    const divRegex = /<div[^>]*>(.*?)<\/div>/gs;
    const hrefRegex = /href="([^"]*)"/;

    while ((match = divRegex.exec(htmlString)) !== null && !!match[1]) {
      divs.push(match[1]);
    }

    logger.info({ divs })

    for (const div of divs) {
      const imgs = [];
      // 图片
      while ((match = imgRegex.exec(div)) !== null) {
        const srcMatch = div.match(/src="([^"]*)"/);
        const urlParams = new URLSearchParams(srcMatch[1].split('?')[1]);
        const token = urlParams.get('token');
        imgs.push({ token });
      }
      if (imgs.length > 0) {
        const imgKeys = await getImageKeys(imgs);
        const imgElement = getCardImgElement(imgKeys);
        formattedData.push(imgElement);
      }
      logger.info({ div });
      if ((match = imgRegex.exec(div)) === null) {
        const content = parseMarkdown(div);
        logger.info({ content });
        formattedData.push({
          tag: "div",
          text: {
            tag: "markdown",
            content
          }
        });
      }
    }
    logger.info({ formattedData });
    return {
      msg_type: "interactive",
      content: JSON.stringify(formattedData)
    };
  };

  // 获取消息内容
  const getContent = async (type) => {
    switch (type) {
      // 富文本类型消息
      case 'option_rich_text':
        const postData = await formatRichToCard(record.message_richtext.raw, record.message_title);
        return {
          msg_type: "post",
          content: JSON.stringify(postData)
        };
      // 视频类型消息直接发成文本类型
      case 'option_video':
        const textObj = {
          text: `${record.message_title ?? ''}\n\n${record.video_url}`
        }
        return {
          msg_type: "text",
          content: JSON.stringify(textObj)
        };
      // 消息卡片模板类型消息
      case 'option_card':
        const data = {
          type: 'template',
          data: {
            template_id: record.message_template_id,
          }
        };
        return {
          msg_type: "interactive",
          content: JSON.stringify(data)
        };
      // 图片类型消息
      default:
        const res = await getImgContent();
        return res;
    };
  }

  try {
    if (!record.option_message_type) {
      logger.error("缺少消息类型");
      throw new Error("缺少消息类型");
    }
    const content = await getContent(record.option_message_type)
    const receive_id_type = record.send_channel === "option_group" ? "chat_id" : "open_id";
    logger.info({ content });
    return {
      ...content,
      receive_id_type
    };
  } catch (error) {
    throw new Error("生成内容失败", error);
  }
};

// 获取飞书卡片的图片布局信息
const getCardImgElement = (imageKeys) => {
  // 多张图片使用消息卡片模板类型
  const columns = imageKeys.map(img_key => ({
    tag: "column",
    width: "weighted",
    weight: 1,
    elements: [
      {
        img_key,
        tag: "img",
        mode: "fit_horizontal",
        preview: true,
        alt: {
          content: "",
          tag: "plain_text"
        },
      }
    ]
  }));
  const elements = {
    tag: "column_set",
    background_style: "default",
    horizontal_spacing: "default",
    columns,
    flex_mode: imageKeys.length === 1
      ? "none"
      : [2, 4].includes(imageKeys.length)
        ? "bisect"
        : "trisect",
  };

  return elements;
};

const parseMarkdown = (text) => {
  const tagRegex = /<([a-z]+)[^>]*>(.*?)<\/\1>/;
  const replaceText = str => str.replace(/<[^>]*>/g, '');

  const tagHandlers = {
    a: (match, content) => {
      const url = match.match(/href="(.*?)"/)[1];
      return "[" + replaceText(content) + "](" + url + ")";
    },
    b: (content) => "**" + replaceText(content) + "**",
    i: (content) => "*" + replaceText(content) + "*",
    s: (content) => "~~~" + replaceText(content) + "~~~"
  };

  return text.replace(tagRegex, (match, tagName, content) => {
    const handler = tagHandlers[tagName];
    return handler ? handler(match, content) : content;
  });
};