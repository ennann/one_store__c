// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { batchOperation } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info('开始更新门店成员信息');

    // 获取所有门店数据
    const allStoreRecords = [];
    await application.data
        .object('object_store')
        .select('store_department', 'store_manager')
        .where({ store_department: application.operator.notEmpty() })
        .findStream(async records => {
            allStoreRecords.push(...records);
        });
    logger.info(`获取到门店数据 ${allStoreRecords.length} 条`);

    // 获取所有的 store_department
    let storeDepartmentRecords = allStoreRecords.map(record => record.store_department);
    logger.info(`获取到门店部门数据 ${storeDepartmentRecords.length} 条`);

    // 对 storeDepartmentRecords 去重，去重的逻辑是，数组内的对象的 _id 字段相同则认为是相同的对象
    // storeDepartmentRecords = storeDepartmentRecords.filter((department, index, self) => {
    //     return index === self.findIndex(t => t._id === department._id);
    // });
    let departmentIds = storeDepartmentRecords.map(department => department._id);
    logger.info(`去重后门店部门数据 ${storeDepartmentRecords.length} 条`);

    // 对 departmentIds 去重
    departmentIds = Array.from(new Set(departmentIds));
    logger.info(`去重后门店部门 ID 数据 ${departmentIds.length} 条`, departmentIds);

    const allDepartmentRecords = [];
    await application.data
        .object('_department')
        .select('_name', '_manager')
        .where({ _id: application.operator.in(departmentIds) })
        .findStream(async records => {
            allDepartmentRecords.push(...records);
        });
    logger.info(`获取到部门数据 ${allDepartmentRecords.length} 条`);

    // 定义一个函数，用于查询部门的所有成员
    const getDepartmentMembers = async department => {
        const members = await application.data.object('_user').select('_name').where({ _department: department._id }).find();
        // 将 members 保存到 department 对象中
        department.members = members;
        return department;
    };

    // 然后进行循环创建 Promise
    const departmentMemberRecords = allDepartmentRecords.map(department => getDepartmentMembers(department));

    // 获取所有的部门成员
    const allDepartmentMembers = await Promise.all(departmentMemberRecords);

    logger.info(`获取到所有部门成员数据 ${allDepartmentMembers.length} 条`);
    logger.info(JSON.stringify(allDepartmentMembers, null, 2));

    // 批量更新门店成员信息,object_store 下的 store_staff 字段，构造批量更新数据
    // 1. 循环 allStoreRecords 数据，allStoreRecords 元素的 _id 是门店记录的 _id
    // 2. 通过 allStoreRecords 元素的 store_department._id ，从 allDepartmentMembers 得到对应的部门成员数据(条件为 allDepartmentMembers 元素的 _id === store_department._id)
    // 3. 构造批量更新数据
    // [
    //     {
    //         _id: 1795848308670708, // 门店记录的 _id
    //         store_manager: { _id: 1212121212 }, // 门店的店长 从 allDepartmentMembers 根据条件获得的 manager id，如果 manager 为 null，则不需要更新
    //         store_staff: [ { _id: 1212121212 }, { _id: 1212121212 } ] // 根据 allDepartmentMembers 根据条件获得的 members id，但是需要去除 store_manager 的 id，如果 manager 为 null，则不需要去除
    //     }
    // ]

    let batchUpdateRecords = [];

    // 循环 allStoreRecords 数据
    allStoreRecords.forEach(storeRecord => {
        // 通过 allStoreRecords 元素的 store_department._id ，从 allDepartmentMembers 得到对应的部门成员数据
        const departmentMembers = allDepartmentMembers.find(department => department._id === storeRecord.store_department._id);
        if (departmentMembers) {
            // 构造批量更新数据
            const storeStaff = departmentMembers.members.filter(member => member._id !== departmentMembers._manager?._id);
            batchUpdateRecords.push({
                _id: storeRecord._id,
                store_manager: departmentMembers._manager?._id ? departmentMembers._manager : { _id: storeRecord?.store_manager },
                store_staff: storeStaff.map(staff => ({ _id: staff._id })),
            });
        }
    });

    logger.info(`构造批量更新数据 ${batchUpdateRecords.length} 条`);
    logger.info(JSON.stringify(batchUpdateRecords, null, 2));

    await batchOperation(logger, 'object_store', 'batchUpdate', batchUpdateRecords, 500);

    // todo 完成子表门店成员信息的更新
    
};
