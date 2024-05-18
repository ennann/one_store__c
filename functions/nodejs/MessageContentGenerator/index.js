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
      let data = [];
      const imgs = [];

      // 图片
      while ((match = imgRegex.exec(div)) !== null) {
        const srcMatch = div.match(/src="([^"]*)"/);
        const urlParams = new URLSearchParams(srcMatch[1].split('?')[1]);
        const token = urlParams.get('token');
        imgs.push({ token });
        const imgKeys = await getImageKeys(imgs);
        const imgElement = getCardImgElement(imgKeys);
        formattedData.push(imgElement);
      }

      logger.info({ div });
      formattedData.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: div
        }
      })
      // const textSegments = div.replace(imgRegex, '').split(tagRegex);
      // const textList = textSegments.filter(i => !!i);
      // if (textList.length === 1) {
      //   let _item = { tag: 'text', text: textList[0], style: getStyles(div) }
      //   if (/<a/.test(div)) {
      //     const aMatch = div.match(hrefRegex);
      //     _item = {
      //       ..._item,
      //       tag: "a",
      //       href: aMatch?.[1] ?? ''
      //     }
      //   }
      //   data.push(_item);
      // }
      // if (textList.length > 1) {
      //   const matches = div.match(/<[^>]+>|[^<]+/g);
      //   const list = mergeTags(matches);
      //   list.forEach((text, index) => {
      //     let item = { tag: 'text', text: textList[index], style: getStyles(text) };
      //     if (/<a/.test(text)) {
      //       const match = text.match(hrefRegex);
      //       item = {
      //         ...item,
      //         tag: "a",
      //         href: match?.[1] ?? ''
      //       }
      //     }
      //     data.push(item);
      //   });
      // }
      // data.length > 0 && formattedData.push(data);
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
          text: `${record.video_url} 
                 ${record.message_title ?? ''}`
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
  const elements = [{
    tag: "column_set",
    background_style: "default",
    horizontal_spacing: "default",
    columns,
    flex_mode: imageKeys.length === 1
      ? "none"
      : [2, 4].includes(imageKeys.length)
        ? "bisect"
        : "trisect",
  }];

  return elements;
};

function getStyles(text) {
  const style = [];
  if (/<u>/.test(text)) {
    style.push("underline");
  }
  if (/<b>/.test(text)) {
    style.push("bold");
  }
  if (/<i>/.test(text)) {
    style.push("italic");
  }
  if (/<s>/.test(text)) {
    style.push("lineThrough");
  }
  return style;
}

function mergeTags(arr) {
  let mergedArray = [];
  let tempStr = '';

  for (let i = 0; i < arr.length; i++) {
    if (arr[i].startsWith('<') && arr[i].endsWith('>')) {
      // 如果是以标签开始的字符串，则将其添加到tempStr中
      tempStr += arr[i];
      if (arr[i].endsWith('</')) {
        // 如果是以闭合标签结束的字符串，则将tempStr添加到mergedArray中，并重置tempStr
        mergedArray.push(tempStr);
        tempStr = '';
      }
    } else {
      // 如果不是以标签开始的字符串，则直接添加到mergedArray中
      if (tempStr) {
        // 如果tempStr中有内容，说明前面有标签，将其添加到mergedArray中
        mergedArray.push(tempStr);
        tempStr = ''; // 重置tempStr
      }
      mergedArray.push(arr[i]);
    }
  }

  const list = mergedArray.reduce((pre, ele, index, arr) => {
    if (/</.test(ele) || /<\/[^>]+>/.test(ele)) {
      return pre;
    }
    if (/</.test(arr[index - 1]) && /<\/[^>]+>/.test(arr[index + 1])) {
      return [...pre, arr[index - 1] + ele + arr[index + 1]];
    }
    return [...pre, ele];
  }, []);

  return list;
}

