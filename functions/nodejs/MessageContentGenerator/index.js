// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const dayjs = require("dayjs");
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
  logger.info(`${new Date()} 消息卡片内容生成器函数开始执行...`);
  // https://open.feishu.cn/document/server-docs/im-v1/message-content-description/create_json#45e0953e
  // https://open.feishu.cn/document/server-docs/im-v1/message/create?appId=cli_a68809f3b7f9500d
  logger.info({ params });
  const { message_def } = params;

  // redis判断是否存在执行中任务
  const KEY = message_def._id;
  const redisValue = await baas.redis.get(KEY);
  logger.info({ redisValue });
  // if (redisValue) {
  //   logger.info("已存在执行中发送消息任务");
  //   return;
  // };

  let receive_id_type = message_def.send_channel === "option_group" ? "chat_id" : "open_id";
  let sendIds = []

  let errorNum = 0;
  const MAX_ERROR_NUM = 5; // 最大失败次数
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
      errorNum = 0;
      return imageKeyRes.image_key;
    } catch (error) {
      if (errorNum >= MAX_ERROR_NUM) {
        errorNum = 0;
        logger.error(`获取图片失败超过最大次数${MAX_ERROR_NUM} - `, error);
      }
      logger.error(error);
      errorNum += 1;
      await getImgKey(token);
    }
  };

  // 获取多张图片image_key
  const getImageKeys = async (images) => {
    const limitUploadImg = createLimiter(getImgKey);
    const imgUploadList = await Promise.all(images.map(item => limitUploadImg(item.token)));
    return imgUploadList.filter(imgKey => !!imgKey);
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
        // 检查是否包含样式,飞书富文本只支持以下4种字体样式
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
    logger.info({ content });
    return { zh_cn: { title, content } };
  };

  // 图片类型根据图片数量返回消息数据
  const getImgContent = async () => {
    if (!message_def.images || message_def.images.length === 0) {
      logger.error("消息定义没有图片");
      return [];
    }
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
    };
    return {
      msg_type: "interactive",
      content: JSON.stringify(info)
    };
  }

  // 获取消息内容
  const getContent = async (type) => {
    switch (type) {
      // 富文本类型消息
      case 'option_rich_text':
        const postData = await transformRichText(message_def.message_richtext, message_def.message_title);
        return {
          msg_type: "post",
          content: JSON.stringify(postData)
        };
      // 视频类型消息直接发成文本类型
      case 'option_video':
        const textObj = { text: `${message_def.message_title} ${message_def.video_url}` };
        return {
          msg_type: "text",
          content: JSON.stringify(textObj)
        };
      // 消息卡片模板类型消息
      case 'option_card':
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
      // 图片类型消息
      default:
        const res = await getImgContent();
        return res;
    };
  }

  // 新增发送记录
  const createSendRecord = async () => {
    try {
      const times = new Date().getTime();
      const batch_no = message_def._id + '-' + times;
      const createData = {
        batch_no,
        option_status: "option_01",
        message_send_def: { _id: message_def._id },
        send_start_datetime: dayjs().valueOf(),
      };
      const res = await application.data.object('object_message_send').create(createData);
      logger.info('创建发送日志成功', res);
      return res._id;
    } catch (error) {
      logger.error('创建发送日志失败', error);
    }
  };

  // 获取消息内容;
  const res = await getContent(message_def.option_message_type);

  // 发送消息
  const sendMessage = async (receive_id) => {
    const paramsData = {
      ...res,
      receive_id,
      receive_id_type
    };
    logger.info({ paramsData });
    try {
      const res = await faas.function('MessageCardSend').invoke({ ...paramsData });
      errorNum = 0;
      return res;
    } catch (error) {
      if (errorNum >= MAX_ERROR_NUM) {
        errorNum = 0;
        logger.error(`发送消息失败超过最大次数${MAX_ERROR_NUM} - `, paramsData);
      }
      logger.error(error);
      errorNum += 1;
      await sendMessage(receive_id);
    }
  };

  try {
    if (!message_def.send_channel) {
      logger.error("没有选择飞书发送渠道");
      return;
    }

    // 消息渠道为飞书群
    if (message_def.send_channel === "option_group") {
      if (!message_def.chat_rule) {
        logger.error("缺少群组筛选规则");
        return;
      }
      const chatRecordList = await faas.function('DeployChatRange')
        .invoke({ deploy_rule: message_def.chat_rule });
      logger.info({ chatRecordList });
      sendIds = chatRecordList.map(i => i.chat_id);
      logger.info({ sendIds });
    }

    // 消息渠道为个人
    if (message_def.send_channel === "option_user") {
      if (!message_def.send_channel) {
        logger.error("缺少人员筛选规则");
        return;
      }
      const userList = await faas.function('DeployMemberRange').invoke({ user_rule: message_def.user_rule });
      sendIds = userList.map(i => i.open_id);
    }

    if (sendIds.length > 0) {
      // 创建消息发送记录
      const recordId = await createSendRecord();
      // 缓存执行记录
      await baas.redis.set(KEY, new Date().getTime());
      // 限流器
      const limitSendMessage = createLimiter(sendMessage);
      // 统一调用发送
      const sendMessageResult = await Promise.all(sendIds.map((id) => limitSendMessage(id)));
      logger.info({ sendMessageResult });
      const successRecords = sendMessageResult.filter(result => result.code === 0);
      const failRecords = sendMessageResult.filter(result => result.code !== 0);
      logger.info(`消息总数：${sendIds.length}`);
      logger.info(`成功数量：${successRecords.length}`);
      logger.info(`失败数量：${failRecords.length}`);

      // 获取发送状态，option_02-发送完成，option_049fb10544f-部分成功，option_03-发送失败
      let option_status;
      if (successRecords.length === sendIds.length) {
        option_status = "option_02";
      } else if (failRecords.length === sendIds.length) {
        option_status = "option_03";
      } else {
        option_status = "option_049fb10544f";
      }

      // 更新发送记录
      if (recordId) {
        try {
          const updataData = {
            _id: recordId,
            option_status,
            send_count: sendIds.length,
            success_count: successRecords.length,
            fail_count: failRecords.length,
            send_end_datetime: dayjs().valueOf(),
          };
          logger.info({ updataData });
          await application.data.object("object_message_send").update(updataData);
          // 异步更新消息发送日志
          const res = await baas.tasks.createAsyncTask(
            "UpdateMessageSendLog",
            { sendMessageResult, send_record: { _id: recordId }, message_type: message_def.option_message_type }
          );
          logger.info("执行异步任务", { res });
          logger.info("更新日志记录成功");
        } catch (error) {
          logger.info("更新日志记录失败", error);
        }
      }
    }
  } catch (error) {
    logger.error("生成并发送消息内容失败", error);
    await baas.redis.set(KEY, null);  // redis置空
  }
};