/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`[${new Date().toISOString()}] 获取任务编号函数开始执行`);

    // Response skeleton
    let response = {
        code: 0,
        batch_no: "",
        message: "获取成功"
    };

    // Extract task definition from params
    const {object_task_def} = params;

    // Log task definition
    logger.info(`任务定义: ${JSON.stringify(object_task_def, null, 2)}`);

    // Validate task definition presence
    if (!object_task_def) {
        response.code = -1;
        response.message = "缺少必要参数：任务定义数据";
        return response;
    }

    try {
        const object_task_create_monitors = await application.data.object('object_task_create_monitor')
            .select('_id', 'batch_no')
            .where({task_def: {_id: object_task_def._id}})
            .find();
        let object_task_def_query = await application.data.object('object_task_def')
            .select('_id', 'task_number')
            .where({_id: object_task_def._id})
            .findOne();
        const newBatchNo = `${(object_task_create_monitors.length + 1).toString().padStart(6, '0')}`;
        response.batch_no = object_task_def_query.task_number + '-' + newBatchNo;
    } catch (error) {
        logger.error(`数据库操作失败: ${error}`);
        response.code = -1;
        response.message = '内部服务器错误';
    }
    return response;
};
