// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    // logger.info(`${new Date()} 函数开始执行`);

    // 获取 option_send_method 周期
    

    // 消息内容生成
    const messageContent = await faas.function('MessageContentGenerator').invoke({ message_def });

    // 获取消息卡片发送范围
    // 根据情况获取群组范围或者人员范围



    // 定义单个发送函数

    // Promise.all 调用发送消息函数

    // 将失败的结果存储在 object_message_log 内

    // 一次性的或者重复性的消息定义，会产生 object_message_send 消息发送记录
    // 每一个消息发送记录，会产生 object_message_log 消息发送日志

    // 消息发送日志 需要存发送结果，需要写一个函数，单独的异步执行，将发送结果写入 object_message_log


};
