const { newLarkClient, createLimiter, fetchEmailsByUserId, batchOperation,fetchUserMobilePhoneById } = require('../utils');

/**
 * @param {Params}  params     Custom parameters
 * @param {Context} context    Context parameters, allows detailed context information retrieval
 * @param {Logger}  logger     Logger for event recording
 *
 * @return The resulting data from the function
 */
module.exports = async function (params, context, logger) {
    logger.info('开始执行查询飞书用户组成员函数', { timestamp: new Date(), user: context.user._id });

    const client = await newLarkClient({ userId: context.user._id }, logger);

    let all_user_group = await fetchFeishuUserGroups(logger);

    if (!all_user_group || all_user_group.length === 0) {
        logger.error('错误：缺少用户组信息');
        return { code: -1, message: '缺少用户组信息' };
    }

    const fetchGroupMembers = async group_id => {
        try {
            const result = await client.contact.groupMember.simplelist({
                path: { group_id },
                params: {
                    page_size: 50,
                    member_id_type: 'user_id',
                    member_type: 'user',
                },
            });

            if (result.code !== 0) {
                throw new Error(result.msg);
            }

            return result.data.memberlist.map(member => ({
                member_id: member.member_id,
                member_type: member.member_type,
            }));
        } catch (error) {
            logger.error(`获取用户组成员失败: ${error.message}`, { group_id });
            return []; // Return an empty list in case of an error.
        }
    };

    // 创建限流器
    const limitedFetchGroupMembers = createLimiter(fetchGroupMembers);

    // Loop over all user groups and fetch their members
    const memberFetchPromises = all_user_group.map(async group => {
        const members = await limitedFetchGroupMembers(group.id);
        return { ...group, member_list: members };
    });

    let feishuUserGroup = await Promise.all(memberFetchPromises);

    logger.info('用户组成员查询完成');
    logger.info(JSON.stringify(feishuUserGroup, null, 2));
    feishuUserGroup = await updateUserGroupDetails(feishuUserGroup, logger);

    logger.info('用户组数据更新完成', JSON.stringify(feishuUserGroup, null, 2));
    logger.info('开始更新用户组成员数据');
    await updateUserGroupMember(feishuUserGroup, logger);

    return feishuUserGroup;
};


/**
 * @description 获取飞书用户组列表
 * @param {*} logger
 * @returns
 */
async function fetchFeishuUserGroups(logger) {
    let client = await newLarkClient({ userId: -1 }, logger);

    // Initialize the array to store group data.
    const allGroups = [];

    try {
        // Retrieve group list with pagination handling
        for await (const item of await client.contact.group.simplelistWithIterator({
            params: {
                page_size: 100,
                type: 1,
            },
        })) {
            // logger.info('接收到群组批次数据长度：', item.grouplist.length);
            allGroups.push(...item.grouplist);
        }
    } catch (error) {
        // Log the error and return an empty array if an error occurs.
        logger.error('查询飞书用户组列表时发生错误：', error);
        return []; // Return an empty array to indicate failure or no data retrieved.
    }

    logger.info('查询到的所有群组：', allGroups.length);
    return allGroups;
}


/**
 * @description Update the user group details to apaas database
 * @param {Array} feishuUserGroup The user group details to update
 */
async function updateUserGroupDetails(feishuUserGroup, logger) {
    // 1. 第一步更新用户组数据
    let group_ids = feishuUserGroup.map(group => group.id);

    // todo: 这里应该使用 findStream 方法来找到所有记录
    let apaas_group_records = await application.data
        .object('object_user_group')
        .select(['name', 'description', 'feishu_group_id'])
        .where({ is_from_feishu: true, feishu_group_id: application.operator.in(group_ids) })
        .find();
    logger.info('在 aPaaS 查询到的用户组数量：', apaas_group_records.length);

    // 对于 feishuUserGroup 已经存在的用户组，更新用户组描述；对于不存在的用户组，创建新用户组
    let batchUpdateRecords = [];
    let batchCreateRecords = [];

    for (let group of feishuUserGroup) {
        let apaas_group_record = apaas_group_records.find(record => record.feishu_group_id === group.id);
        if (apaas_group_record) {
            batchUpdateRecords.push({
                _id: apaas_group_record._id,
                name: group.name,
                description: group.description,
                is_from_feishu: true,
            });

            // 在 feishuUserGroup 内增加 _id 属性，作为后续更新用户组成员数据使用
            group._id = apaas_group_record._id;
        } else {
            batchCreateRecords.push({
                name: group.name,
                description: group.description,
                is_from_feishu: true,
                feishu_group_id: group.id,
            });
        }
    }

    logger.info('需要更新的用户组数量：', batchUpdateRecords.length, '需要创建的用户组数量：', batchCreateRecords.length);

    if (batchUpdateRecords.length > 0) {
        logger.info('开始更新用户组数据', JSON.stringify(batchUpdateRecords, null, 2));
        let results = await application.data.object('object_user_group').batchUpdate(batchUpdateRecords);
        // logger.info('用户组数据更新完成, results', results);
    }

    if (batchCreateRecords.length > 0) {
        logger.info('开始创建用户组数据', JSON.stringify(batchCreateRecords, null, 2));
        let results = await application.data.object('object_user_group').batchCreate(batchCreateRecords);
        // results 数据的示例 [ 1212212, 2312323232, 12131313] 为创建的记录的 _id 列表
        logger.info('用户组数据创建完成, results', results);

        // 在 batchCreateRecords 内增加 _id 属性，作为后续更新用户组成员数据使用
        batchCreateRecords.forEach((record, index) => {
            record._id = results[index];
        });

        // 在 feishuUserGroup 内增加 _id 属性，作为后续更新用户组成员数据使用
        batchCreateRecords.forEach(record => {
            let group = feishuUserGroup.find(group => group.id === record.feishu_group_id);
            group._id = record._id;
        });
    }

    logger.info('用户组数据更新完成, feishuUserGroup', feishuUserGroup);

    return feishuUserGroup;
}


/**
 * @description Update the user group member details to apaas database
 * @param {Array} feishuUserGroup The user group details to update
 * @param {Logger} logger Logger for event recording
 */
async function updateUserGroupMember(feishuUserGroup, logger) {
    const updateGroupMember = async group => {
        try {
            const { _id, member_list } = group;
            // 获取飞书平台的用户id值
            let user_id_list = member_list.map(member => member.member_id);

            if (user_id_list.length === 0) {
                logger.info('No user IDs available, skipping operations for', _id);
                return;
            }
            // 根据飞书userId值获取用户邮箱  ----> 原逻辑
            // let user_email_list = await fetchEmailsByUserId(user_id_list);

            // if (user_email_list.length === 0) {
            //     logger.info('No user emails found, skipping database operations for', _id);
            //     return;
            // }
            // 根据用户的邮箱查询相应的apaas的用户信息
            // const apaas_user_records = [];
            // await application.data
            //     .object('_user')
            //     .select(['_email', '_id'])
            //     .where({ _email: application.operator.in(user_email_list) })
            //     .findStream(records => {
            //         apaas_user_records.push(...records);
            //     });
            // logger.info('apaas_user_records', apaas_user_records.length);

            //-------------------------------------------------  新逻辑
            // 使用for循环 通过id值获取用户信息
            const apaas_user_records = [];
            for (const element of user_id_list) {
                // 获取用户的手机号
                let user_phone_number = await fetchUserMobilePhoneById(element);
                let phone_number_without_prefix = user_phone_number.substring(3);
                // // 根据用户的手机号查询相应的apaas的用户信息获取apaas中的用户信息，并存入apaas_user_records中
                await application.data
                .object('_user')
                .select(['_email', '_id','_phoneNumber'])
                .where({ _phoneNumber: application.operator.contain(phone_number_without_prefix) })
                .findStream(records => {
                    apaas_user_records.push(...records);
                });
            }
          logger.info('获取到的用户列表：',apaas_user_records)

            let apaas_user_ids = apaas_user_records.map(record => record._id);
            if (apaas_user_ids.length === 0) {
                logger.info('No aPaaS user IDs found, skipping member deletion and addition for', _id);
                return;
            }

            const apaas_group_member_records = [];
            await application.data
                .object('object_user_group_member')
                .select(['user_group', 'user'])
                .where({ user: application.operator.in(apaas_user_ids), user_group: _id })
                .findStream(records => {
                    apaas_group_member_records.push(...records);
                });

            const batchDeleteRecords = apaas_group_member_records.filter(record => !apaas_user_ids.includes(record.user._id));
            if (batchDeleteRecords.length > 0) {
                let deleteIds = batchDeleteRecords.map(record => record._id);
                await batchOperation(logger, 'object_user_group_member', 'batchDelete', deleteIds);
            }

            let addRecords = apaas_user_ids.filter(user_id => !apaas_group_member_records.some(record => record.user._id === user_id));
            if (addRecords.length > 0) {
                let batchCreateRecords = addRecords.map(user_id => ({
                    user_group: { _id },
                    user: { _id: apaas_user_records.find(record => record._id === user_id)._id },
                }));
                logger.info('开始创建用户组成员数据', JSON.stringify(batchCreateRecords, null, 2));
                let results = await application.data.object('object_user_group_member').batchCreate(batchCreateRecords);
                logger.info('用户组成员数据创建完成, results', results);
            }
        } catch (error) {
            logger.error('An error occurred while updating group member details for group ' + group._id, error);
        }
    };

    let updateGroupMemberPromises = feishuUserGroup.map(updateGroupMember);
    await Promise.all(updateGroupMemberPromises).catch(error => logger.error('Error processing group member updates:', error));
    logger.info('All group updates processed.');
}
