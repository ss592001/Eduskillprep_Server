
const { ObjectId } = require('mongodb');
const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const Question = new Schema({
    id: {
        type: String
    },
    adminId: {
        type: ObjectId
    },
    title: {
        type: String
    },
    tags: {
        type: Array
    },
    passage: {
        type: String
    },
    question: {
        type: String
    },
    explanation: {
        type: String
    },
    answer: {
        type: String
    },

    options: {
        type: Array
    },
    difficulty: {
        type: String
    },
    type: {
        type: String
    },
    diagram: {
        type: String
    },
    topic: {
        type: String
    },
    subTopic: {
        type: String
    }
})
module.exports = mongoose.model('Question', Question);