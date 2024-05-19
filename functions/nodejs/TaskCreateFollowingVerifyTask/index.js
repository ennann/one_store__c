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
    logger.info(`${new Date()} 基于验收任务创建后续验收任务函数开始执行`, params);

    let { verify_task } = params;

    logger.info(`${new Date()} 创建任务验证函数开始执行`);

    // 找到任务记录
    let taskRecord = await application.data
        .object('object_store_task')
        .select('task_def', 'task_chat', 'task_handler', 'name')
        .where({ _id: verify_task.store_task?._id || verify_task.store_task.id })
        .findOne();
    logger.info('任务记录 taskRecord', taskRecord);

    // 找到任务定义记录
    let taskDefineRecord = await application.data
        .object('object_task_def')
        .select('name', 'task_number', 'description', 'option_upload_image', 'option_input_information', 'option_upload_attachement', 'option_is_check', 'check_flow')
        .where({ _id: taskRecord.task_def?._id })
        .findOne();
    logger.info('任务定义记录 taskDefineRecord', taskDefineRecord);

    // 查找任务验收流程记录
    let checkFlowRecord = await application.data
        .object('object_task_check_flow')
        .select('name', 'description', 'task_type')
        .where({ _id: taskDefineRecord.check_flow?._id || taskDefineRecord.check_flow.id })
        .findOne();
    logger.info('任务验收流程记录 checkFlowRecord', checkFlowRecord);

    // 根据当前的验收任务阶段，判断是否还有后续的验收任务需要创建
    let checkFlowDetailRecord;
    let checkActivity = '';


    if (verify_task.check_activity === 'option_03') {
        // 如果当前验收任务阶段是第三个阶段，则无需创建后续验收任务
        logger.info('当前验收任务阶段为最后一个阶段（第三阶段），无需创建后续验收任务');
        return { has_verify_task: false };
    } else if (verify_task.check_activity === 'option_02') {
        // 如果当前验收任务阶段是第二个阶段，则判断是否需要创建第三个阶段的验收任务
        // 查找 option_check_activity: 'option_03' 的任务验收流程明细记录
        checkFlowDetailRecord = await application.data
            .object('object_task_check_flow_detail')
            .select('check_flow', 'option_check_activity', 'option_relation_checkuser', 'checkuser', 'option_check_method', 'sampling_ratio')
            .where({ check_flow: checkFlowRecord?._id, option_check_activity: 'option_03' })
            .findOne();
        logger.info('任务验收流程明细记录 checkFlowDetailRecord', checkFlowDetailRecord);

        if (!checkFlowDetailRecord) {
            logger.info('当前验收任务阶段为第二个阶段，但无需创建第三个阶段的验收任务');
            return { has_verify_task: false };
        }
        // 将新的验收任务阶段设置为第三个阶段
        checkActivity = 'option_03';
    } else if (verify_task.check_activity === 'option_01') {
        // 如果当前验收任务阶段是第一个阶段，则查找 option_check_activity: 'option_02' 的任务验收流程明细记录
        checkFlowDetailRecord = await application.data
            .object('object_task_check_flow_detail')
            .select('check_flow', 'option_check_activity', 'option_relation_checkuser', 'checkuser', 'option_check_method', 'sampling_ratio')
            .where({ check_flow: checkFlowRecord?._id, option_check_activity: 'option_02' })
            .findOne();
        logger.info('任务验收流程明细记录 checkFlowDetailRecord', checkFlowDetailRecord);

        if (!checkFlowDetailRecord) {
            logger.info('当前验收任务阶段为第一个阶段，但无需创建第二个阶段的验收任务');
            return { has_verify_task: true };
        }
        // 将新的验收任务阶段设置为第二个阶段
        checkActivity = 'option_02';
    }

    // 验收任务责任人判断
    let checkTaskHandler = {};

    // 最优先判断：如果验收流程明细记录中的指定验收人不为空，则直接使用
    if (checkFlowDetailRecord.checkuser && checkFlowDetailRecord.checkuser?._id) {
        checkTaskHandler = { _id: checkFlowDetailRecord.checkuser?._id };
    } else {
        // 如果验收流程明细记录中的指定验收人为空，则根据验收流程明细记录中的验收人关系判断
        // option_store_manager 门店店长、option_supervisor 直属上级、option_up_supervisor 间接上级、option_publisher 发布人
        switch (checkFlowDetailRecord.option_relation_checkuser) {
            case 'option_store_manager':
                // 门店店长
                let chatRecord = await application.data
                    .object('object_feishu_chat')
                    .select('chat_owner')
                    .where({ _id: taskRecord.task_chat?._id || taskRecord.task_chat.id })
                    .findOne();
                logger.info('门店店长 chatRecord', chatRecord);
                checkTaskHandler = { _id: chatRecord.chat_owner?._id || chatRecord.chat_owner.id };
                break;
            case 'option_supervisor':
                // 直属上级
                let managerRecord = await application.data
                    .object('_user')
                    .select('_id', '_manager')
                    .where({ _id: taskRecord.task_handler?._id || taskRecord.task_handler.id })
                    .findOne();
                logger.info('直属上级 managerRecord', managerRecord);
                checkTaskHandler = { _id: managerRecord._manager?._id || managerRecord._manager.id };
                break;
            case 'option_up_supervisor':
                // 间接上级
                let supervisorRecord = await application.data
                    .object('_user')
                    .select('_id', '_manager')
                    .where({ _id: taskRecord.task_handler?._id || taskRecord.task_handler.id })
                    .findOne();
                logger.info('直属上级 supervisorRecord', supervisorRecord);

                if (supervisorRecord) {
                    let upSupervisorRecord = await application.data
                        .object('_user')
                        .select('_id', '_manager')
                        .where({ _id: supervisorRecord._manager?._id || supervisorRecord._manager.id })
                        .findOne();
                    logger.info('间接上级 upSupervisorRecord', upSupervisorRecord);
                    checkTaskHandler = upSupervisorRecord
                        ? { _id: upSupervisorRecord._manager?._id || upSupervisorRecord._manager.id }
                        : { _id: supervisorRecord._manager?._id || supervisorRecord._manager.id };
                } else {
                    checkTaskHandler = { _id: 1 };
                }
                break;
            case 'option_publisher':
                // 发布人
                logger.info('发布人 taskRecord.task_handler', taskRecord.task_handler);
                checkTaskHandler = { _id: taskRecord.task_handler?._id || taskRecord.task_handler.id };
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
        store_task: { _id: taskRecord._id },
        task_name: `【验收】${taskRecord.name}`,
        task_handler: checkTaskHandler,
        task_status: 'option_pending',
        task_create_time: dayjs().valueOf(),
        check_activity: checkActivity
    };
    logger.info('验收任务数据 verifyTask', verifyTask);

    // return verifyTask;
    // 创建验收任务
    let verifyTaskRecord = await application.data.object('object_task').create(verifyTask);
    logger.info('验收任务记录 verifyTaskRecord', verifyTaskRecord);
    return { has_verify_task: true };
};
