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
    logger.info(`${new Date()} 函数开始执行`);
    const response = {
        code:0,
        batch_no:"",
        message:"获取成功"
    }
    // 在这里补充业务代码
    const {object_task_def} = params;
    logger.info('任务定义', JSON.stringify(object_task_def, null, 2));
    if (!object_task_def){
        response.code = -1 ;
        response.message = "缺少必要参数：任务定义数据";
    }
    let oldVar = await application.data.object('object_task_create_monitor').select('_id', 'batch_no').where({ 'task_def': object_task_def }).find();
    const length = oldVar.length + 1 ;
    const newBatchNo =  1000000 + length
    response.batch_no = newBatchNo.toString().substring(1);
    return response;
}
