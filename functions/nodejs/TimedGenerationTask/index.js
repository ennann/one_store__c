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
    logger.info(`${new Date()} 定时生成任务记录函数开始执行`);
    //业务梳理
    /**
     * （门店任务管理）
     * 任务定义（任务推送）：object_task_def
     * 门店普通任务（任务清单）：object_store_task
     * 任务处理记录（任务执行监控）：object_task_create_monitor
     */

    /**
     * 根据时间，获取符合时间条件的消息定义记录列表（这一步可以放到流程中获取）
     * 判断处理人类型：
     *      责任人
     *          岗位，部门，用户组
     *      门店
     *          门店群组筛选规则
     *  任务周期：
     *      计划任务
     *          周期定义（天，周，月，季度，半年，年）
     *          重复频率（内容为数值，同周期定义决定了多久生成一条记录）
     *          开始时间（作为查询任务定义的筛选规则）
     *          结束时间（作为查询任务定义的筛选规则）
     *          任务处理时长（处理任务的时间）
     *      一次性任务（定时发送）
     *          判断当前时间是否满足发送条件
     */


}
