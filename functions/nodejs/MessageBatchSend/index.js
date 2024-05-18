// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const dayjs = require('dayjs');
const { createLimiter } = require('../utils');
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  logger.info(`批量发送消息 函数开始执行`, params);

  const { record } = params;

  // redis判断是否存在执行中任务
  const KEY = record._id;
  const redisValue = await baas.redis.get(KEY);
  if (redisValue) {
    throw new Error('已存在执行中发送消息任务');
  }

  let receive_id_type = record.send_channel === 'option_group' ? 'chat_id' : 'user_id';
  let sendIds = [];

  let errorNum = 0;
  const MAX_ERROR_NUM = 5; // 最大失败次数

  // 新增发送记录
  const createSendRecord = async () => {
    try {
      const batch_no = await faas.function('MessageGenerateBatchNumber').invoke({ record: record });
      const createData = {
        batch_no,
        option_status: 'option_01',
        message_send_def: { _id: record._id },
        send_start_datetime: dayjs().valueOf(),
      };
      const res = await application.data.object('object_message_send').create(createData);
      logger.info('创建发送日志成功', res);
      return res._id;
    } catch (error) {
      throw new Error('创建发送日志失败', error);
    }
  };

  // 获取消息内容;
  const messageContent = await faas.function('MessageContentGenerator').invoke({ record });

  // 发送消息
  const sendMessage = async receive_id => {
    const paramsData = {
      ...messageContent,
      receive_id,
    };
    logger.info({ paramsData });
    try {
      const res = await faas.function('MessageCardSend').invoke({ ...paramsData });
      errorNum = 0;
      return res;
    } catch (error) {
      if (errorNum >= MAX_ERROR_NUM) {
        errorNum = 0;
        throw new Error(`发送消息失败超过最大次数${MAX_ERROR_NUM} - `, paramsData);
      }
      logger.info(error);
      errorNum += 1;
      await sendMessage(receive_id);
    }
  };

  try {
    if (!record.send_channel) {
      throw new Error('没有选择飞书发送渠道');
    }

    // 消息渠道为飞书群
    if (record.send_channel === 'option_group') {
      if (!record.chat_rule) {
        throw new Error('缺少群组筛选规则');
      }
      const chatRecordList = await faas.function('DeployChatRange').invoke({ deploy_rule: record.chat_rule });
      logger.info({ chatRecordList });
      sendIds = chatRecordList.map(i => i.chat_id);
      logger.info({ sendIds });
    }

    // 消息渠道为个人
    if (record.send_channel === 'option_user') {
      if (!record.send_channel) {
        throw new Error('缺少人员筛选规则');
      }
      const userList = await faas.function('DeployMemberRange').invoke({ user_rule: record.user_rule });
      sendIds = userList.map(i => i.user_id);
    }

    if (sendIds.length > 0) {
      // 缓存执行记录
      await baas.redis.set(KEY, new Date().getTime());
      // 创建消息发送记录
      const recordId = await createSendRecord();
      // 限流器
      const limitSendMessage = createLimiter(sendMessage);
      // 统一调用发送
      const sendMessageResult = await Promise.all(sendIds.map(id => limitSendMessage(id)));
      logger.info({ sendMessageResult });
      const successRecords = sendMessageResult.filter(result => result.code === 0);
      const failRecords = sendMessageResult.filter(result => result.code !== 0);
      logger.info(`消息总数：${sendIds.length}`);
      logger.info(`成功数量：${successRecords.length}`);
      logger.info(`失败数量：${failRecords.length}`);

      // 获取发送状态，option_02-发送完成，option_049fb10544f-部分成功，option_03-发送失败
      let option_status;
      if (successRecords.length === sendIds.length) {
        option_status = 'option_02';
      } else if (failRecords.length === sendIds.length) {
        option_status = 'option_03';
      } else {
        option_status = 'option_049fb10544f';
      }

      // 更新发送记录
      if (recordId) {
        try {
          const updateData = {
            _id: recordId,
            option_status,
            send_count: sendIds.length,
            success_count: successRecords.length,
            fail_count: failRecords.length,
            send_end_datetime: dayjs().valueOf(),
          };
          logger.info({ updateData });
          await application.data.object('object_message_send').update(updateData);
          // 异步更新消息发送日志
          const res = await baas.tasks.createAsyncTask('UpdateMessageSendLog', {
            receive_id_type,
            sendMessageResult,
            send_record: { _id: recordId },
            message_type: record.option_message_type,
          });
          logger.info('更新消息记录成功, 执行更新日志异步任务', { res });
        } catch (error) {
          throw new Error('更新日志记录失败', error);
        }
      }
    }
    return { code: 0, message: '批量发送消息成功' };
  } catch (error) {
    logger.error('批量发送消息失败', error);
    throw new Error('批量发送消息失败', error);
  } finally {
    // redis置空
    await baas.redis.set(KEY, null);
  }
};
