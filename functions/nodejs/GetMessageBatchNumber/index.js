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
    logger.info(`${new Date()} 获取消息编号函数开始执行`);
    const response = {
        code: 0,
        batch_no: "",
        message: "获取成功"
    }
    // 在这里补充业务代码
    const {object_chat_message_def} = params;
    logger.info('消息定义', JSON.stringify(object_chat_message_def, null, 2));
    if (!object_chat_message_def) {
        response.code = -1;
        response.message = "缺少必要参数：消息定义数据";
        return response;
    }
    try {
        const existingTasks = await application.data.object('object_message_send').select('_id', 'batch_no')
            .where({'message_send_def': {_id: object_chat_message_def._id}}).find();
        let object_chat_message_def_query = await application.data.object('object_chat_message_def')
            .select('_id', 'number')
            .where({_id: object_chat_message_def._id})
            .findOne();
        const newBatchNo =  + `${(existingTasks.length + 1).toString().padStart(6, '0')}`;
        response.batch_no = object_chat_message_def_query.number + '-' + newBatchNo;
        return response;
    } catch (error) {
        logger.error(`数据库操作失败: ${error}`);
        response.code = -1;
        response.message = '内部服务器错误';
        return response;
    }
}
