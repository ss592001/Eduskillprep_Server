
const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const User = new Schema({
    name: {
        type: String
    },
    email: {
        type: String
    },
    password: {
        type: String
    },
    assignedTests: {
        type: Array
    },
    completedTests: {
        type: Array
    },
    isApproved: {
        type: Boolean,
        default: false
    },
    otp: {
        type: String
    },
})
module.exports = mongoose.model('User', User);