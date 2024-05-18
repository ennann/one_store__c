const dayjs = require('dayjs');
const _ = application.operator;

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`${new Date()} 任务触发器函数开始执行`);

    const currentTime = dayjs().valueOf(); // 当前时间
    const timeBuffer = 1000 * 60 * 5; // 5 minutes buffer
    logger.info('当前时间->', currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));

    // 查询所有的任务定义数据
    const taskDefineRecords = await application.data
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
            'option_upload_image', //任务要求上传图片
            'option_input_information', //任务要求录入完成信息
            'option_upload_attachement', //任务要求上传附件
            'is_workday_support', //是否支持工作日历 布尔
            'warning_time', //设置预警时间（小时）
            'set_warning_time', //设置任务到期前提醒
        )
        .where(
            _.or(
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_cycle',
                    datetime_start: _.lte(currentTime),
                    datetime_end: _.gte(currentTime),
                }), // 周期任务的条件
                _.and({
                    option_status: 'option_enable',
                    option_method: 'option_once',
                    boolean_public_now: false,
                    datetime_publish: _.lte(currentTime + timeBuffer), // 5分钟内的任务
                    datetime_publish: _.gte(currentTime - timeBuffer),
                }), // 一次性任务的条件
            ),
        )
        .find();

    logger.info('查询到的任务定义数量->', taskDefineRecords.length);
    logger.info(taskDefineRecords);

    const unitMapping = {
        option_day: 'day',
        option_week: 'week',
        option_month: 'month',
        option_quarter: { unit: 'month', factor: 3 },
        option_half_year: { unit: 'month', factor: 6 },
        option_year: 'year',
    };

    const valuedTaskDefineList = [];

    const calculateTriggerDates = (startDate, endDate, repetitionRate, unit) => {
        const triggerDates = [];
        let nextTriggerDate = startDate;

        while (nextTriggerDate.isBefore(endDate) || nextTriggerDate.isSame(endDate)) {
            triggerDates.push(nextTriggerDate.format('YYYY-MM-DD'));
            nextTriggerDate = nextTriggerDate.add(repetitionRate, unit);
        }

        return triggerDates;
    };

    const isTriggerTime = (currentTime, triggerTime, timeBuffer) => {
        return currentTime >= triggerTime - timeBuffer && currentTime <= triggerTime + timeBuffer;
    };

    // 循环所有 taskDefineRecords
    for (const task of taskDefineRecords) {
        if (task.option_method === 'option_once') {
            valuedTaskDefineList.push(task);
            logger.info(`一次性任务: ${task.name}`);
            continue;
        }

        if (task.option_method === 'option_cycle') {
            const { datetime_start: startTime, datetime_end: endTime, option_time_cycle: cycleType, repetition_rate: repetitionRate } = task;
            const startDate = dayjs(startTime);
            const endDate = dayjs(endTime);
            let unit,
                factor = 1;

            if (unitMapping[cycleType]) {
                if (typeof unitMapping[cycleType] === 'object') {
                    unit = unitMapping[cycleType].unit;
                    factor = unitMapping[cycleType].factor;
                } else {
                    unit = unitMapping[cycleType];
                }
            } else {
                logger.warn(`未知的周期类型: ${cycleType}`);
                continue;
            }

            const triggerDates = calculateTriggerDates(startDate, endDate, repetitionRate * factor, unit);

            logger.info(`周期任务: ${task.name} 触发日期数组: ${triggerDates.join(', ')}`);

            if (triggerDates.includes(dayjs(currentTime).format('YYYY-MM-DD'))) {
                const triggerTime = dayjs(`${dayjs(currentTime).format('YYYY-MM-DD')} ${startDate.format('HH:mm:ss')}`).valueOf();

                if (isTriggerTime(currentTime, triggerTime, timeBuffer)) {
                    valuedTaskDefineList.push(task);
                    logger.info(`周期任务: ${task.name} 触发时间: ${triggerTime}, ${dayjs(triggerTime).format('YYYY-MM-DD HH:mm:ss')}`);
                }
            }
        }
    }

    logger.info('需要触发的任务定义数量->', valuedTaskDefineList.length);

    // return valuedTaskDefineList;

    // 创建一个函数，用于调用任务生成函数，最后使用 Promise.all 来并发执行 valuedTaskDefineList 内的任务定义
    const invokeTaskGenerateFunction = async taskDefine => {
        // 调用任务生成函数
        return faas.function('TaskTimedGeneration').invoke({ task_def_record: taskDefine});
    };
    
    // 并发执行任务生成函数
    const taskGenerationResult = await Promise.all(valuedTaskDefineList.map(invokeTaskGenerateFunction));
    logger.info('任务生成函数执行结果->', taskGenerationResult);
    
    const successList = taskGenerationResult.filter(item => item.code === 0);
    const failList = taskGenerationResult.filter(item => item.code !== 0);

    // const taskGenerationResult = await faas.function('TaskTimedGeneration').invoke({ object_task_defs: valuedTaskDefineList });
    // const successList = taskGenerationResult.data.successfulTasks;
    // const failList = taskGenerationResult.data.failedTasks;

    return {
        message: '任务触发器函数执行成功',
        successList,
        failList,
    };
};
