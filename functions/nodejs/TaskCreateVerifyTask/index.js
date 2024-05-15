// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
const dayjs = require('dayjs');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`${new Date()} 创建任务验证函数开始执行`);

    let { store_task } = params;

    // 找到任务定义记录
    let taskDefineRecord = await application.data
        .object('object_task_def')
        .select('name', 'task_number', 'description', 'option_upload_image', 'option_input_information', 'option_upload_attachement', 'option_is_check', 'check_flow')
        .where({ _id: store_task.task_def._id || store_task.task_def.id })
        .findOne();
    logger.info('任务定义记录 taskDefineRecord', taskDefineRecord);

    // 查找任务验收流程记录
    let checkFlowRecord = await application.data
        .object('object_task_check_flow')
        .select('name', 'description', 'task_type')
        .where({ _id: taskDefineRecord.check_flow._id || taskDefineRecord.check_flow.id })
        .findOne();
    logger.info('任务验收流程记录 checkFlowRecord', checkFlowRecord);

    // 查找任务验收流程明细记录
    let checkFlowDetailRecords = await application.data
        .object('object_task_check_flow_detail')
        .select('check_flow', 'option_check_activity', 'option_relation_checkuser', 'checkuser', 'option_check_method', 'sampling_ratio')
        .where({ check_flow: checkFlowRecord._id, option_check_activity: 'option_01' })
        .findOne();
    logger.info('任务验收流程明细记录 checkFlowDetailRecords', checkFlowDetailRecords);

    // 验收任务责任人判断
    let checkTaskHandler = {};

    // 最优先判断：如果验收流程明细记录中的指定验收人不为空，则直接使用
    if (checkFlowDetailRecords.checkuser && checkFlowDetailRecords.checkuser._id) {
        checkTaskHandler = { _id: checkFlowDetailRecords.checkuser._id };
    } else {
        // 如果验收流程明细记录中的指定验收人为空，则根据验收流程明细记录中的验收人关系判断
        // option_store_manager 门店店长、option_supervisor 直属上级、option_up_supervisor 间接上级、option_publisher 发布人
        switch (checkFlowDetailRecords.option_relation_checkuser) {
            case 'option_store_manager':
                // 门店店长
                let chatRecord = await application.data
                    .object('object_feishu_chat')
                    .select('chat_owner')
                    .where({ _id: store_task.task_chat._id || store_task.task_chat.id })
                    .findOne();
                checkTaskHandler = { _id: chatRecord.chat_owner._id || chatRecord.chat_owner.id };
                break;
            case 'option_supervisor':
                // 直属上级
                let managerRecord = await application.data
                    .object('_user')
                    .select('_id', '_manager')
                    .where({ _id: store_task.task_handler._id || store_task.task_handler.id })
                    .findOne();
                checkTaskHandler = { _id: managerRecord._manager._id || managerRecord._manager.id };
                break;
            case 'option_up_supervisor':
                // 间接上级
                let supervisorRecord = await application.data
                    .object('_user')
                    .select('_id', '_manager')
                    .where({ _id: store_task.task_handler._id || store_task.task_handler.id })
                    .findOne();

                let upSupervisorRecord = await application.data
                    .object('_user')
                    .select('_id', '_manager')
                    .where({ _id: supervisorRecord._manager._id || supervisorRecord._manager.id })
                    .findOne();

                checkTaskHandler = { _id: upSupervisorRecord._manager._id || upSupervisorRecord._manager.id };
                break;
            case 'option_publisher':
                // 发布人
                checkTaskHandler = { _id: store_task.task_handler._id || store_task.task_handler.id };
                break;
            default:
                // 默认值
                checkTaskHandler = { _id: 1 };
                break;
        }
    }
    logger.info('经过判断的验收任务责任人 checkTaskHandler', checkTaskHandler);

    // 构造验收任务数据
    let verifyTask = {
        store_task: { _id: store_task._id },
        task_name: `【验收】${store_task.name}`,
        task_handler: checkTaskHandler, // checkFlowDetailRecords.checkuser 不为空则直接使用，如果为空则使用默认值
        task_status: 'option_pending',
        task_create_time: dayjs().valueOf(),
        check_activity: checkFlowDetailRecords.option_check_activity,
    };
    logger.info('验收任务数据 verifyTask', verifyTask);

    // 创建验收任务
    let verifyTaskRecord = await application.data.object('object_task').create(verifyTask);
    logger.info('验收任务记录 verifyTaskRecord', verifyTaskRecord);

};
