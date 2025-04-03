// 恢复成空文件，之前是没有内容的
// 此文件仅是一个桥接，让JavaScript代码可以导入TypeScript实体

module.exports = require('./index.ts');
module.exports.default = require('./index.ts'); 