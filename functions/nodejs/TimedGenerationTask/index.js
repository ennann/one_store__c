// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
const dayjs = require("dayjs");

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`定时生成任务记录函数开始执行 ${new Date()}`);

    // 日志功能
    logger.info(`定时生成任务记录函数开始执行 ${new Date()}`);

    //一次性非立即发布任务
    const query = {
        option_status: 'option_02', //启用
    };

    //获取符合条件的任务定义记录列表
    let finalTaskDefList = await fetchTaskDefRecords(query, '一次性非立即发布任务');

    if (finalTaskDefList.length === 0) {
        logger.warn('查询满足条件的一次性非立即发布任务记录为0');
        return { code: -2, message: '未找到有效的任务定义记录' };
    }


    // 为每个任务定义实例记录生成任务批次号并创建任务处理记录
    const taskCreateResults = await Promise.all(finalTaskDefList.map(task => createTaskMonitorEntry(task, logger)));


    const successfulTasks = taskCreateResults.filter(result => result.code === 0);
    const failedTasks = taskCreateResults.filter(result => result.code !== 0);

    logger.info(`成功创建任务处理记录数量: ${successfulTasks.length}, 失败数量: ${failedTasks.length}`);

    return {
        code: successfulTasks.length > 0 ? 0 : -1,
        message: '任务处理记录生成完成',
        data: {
            successfulTasks: successfulTasks,
            failedTasks: failedTasks,
        },
    };

}




const fetchTaskDefRecords = async (query, description) => {
    try {
        const taskRecords = [];
        await application.data
            .object('object_task_def')
            .select(
                '_id',
                'name', //任务名称
                'task_number', //任务编码
                'description', //任务描述
                'task_tag', //任务分类（对象）
                'option_method', //任务周期（全局选项）：计划任务：option_01，一次性任务：option_02
                'option_time_cycle', //任务定义（全局选项）：天:option_day，周:option_week，月:option_month，季度:option_quarter，半年:option_half_year，年:option_year
                'repetition_rate', //重复频率
                'boolean_public_now', //是否立即发布
                'datetime_publish', //发布时间
                'datetime_start', //开始时间
                'datetime_end', //结束时间
                'deal_duration', //任务处理时长
                'option_status', //状态（全局选项）：新建:option_01，启用:option_02，禁用:option_03
                'send_channel', //发送渠道（全局选项）：发送到飞书群:option_group，发送到个人:option_user
                'option_handler_type', //任务处理人类型（全局选项）：飞书群:option_01，责任人：option_02
                'chat_rule', //群组筛选规则（对象）
                'user_rule', //人员筛选规则（对象）
                'carbon_copy', //任务抄送人（对象）
                'option_is_check', //任务是否需要验收(全局选项)：是：option_yes，否：option_no
                'check_flow', //任务验收流程(对象)
                'task_publisher', //发布人（对象）
                'publish_department', //发布人所属部门(对象)
                'option_priority', //优先级(全局选项)：高:option_01，中:option_02，低:option_03
            )
            .where(query)
            .findStream(async records => {
                taskRecords.push(...records.map(item => item));
            });
        logger.info(`${description} 查询成功：`, taskRecords.length);
        return taskRecords;
    } catch (error) {
        logger.error(`${description}查询时发生错误：`, error);
        return finalTaskDefList;
    }
};


async function createTaskMonitorEntry(task, logger) {
    try {
        const taskBatchNo = await faas.function('GetTaskBatchNumber').invoke({ object_task_def: task });
        const createData = {
            task_def: { _id: task._id },
            batch_no: task._id + '-' + taskBatchNo,
            option_status: 'option_01',
            task_create_time: dayjs().valueOf(),
        };

        await application.data.object('object_task_create_monitor').create(createData);
        return { code: 0, message: '成功创建任务处理记录', task_id: task._id };
    } catch (error) {
        logger.error(`创建任务处理记录失败：${task._id}`, error);
        return { code: -1, message: error.message, task_id: task._id };
    }
}
