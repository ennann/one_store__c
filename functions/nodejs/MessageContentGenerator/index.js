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
    logger.info(`${new Date()} 消息卡片内容生成器函数开始执行...`);

    const { message_def } = params;
    logger.info(params);

    const fields = await application.metadata.object('object_chat_message_def').getFields();
    const fieldApiNames = fields.map(item => item.apiName);
    const record = await application.data.object('object_chat_message_def').select(fieldApiNames).where({ _id: message_def._id }).findOne();

    logger.info(`record: ${JSON.stringify(record, null, 2)}`);



    const messageType = record.option_message_type;

    // 对消息类型进行判断
    switch (messageType) {
        case 'option_rich_text':
            // 富文本类型消息
            // todo: 完成富文本到消息卡片类型的转换

            break;
        case 'option_video':
            // 视频类型消息
            card = {
                "text": record.video_content + record.video_url
            }

            return JSON.stringify(card);
        case 'option_card':
            // 消息卡片模板类型消息
            card = {
                type: 'template',
                data: {
                    template_id: record.message_template_id,
                },
            };

            return JSON.stringify(card);
    }
};
