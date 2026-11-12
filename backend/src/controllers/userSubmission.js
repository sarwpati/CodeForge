
const Problem = require("../models/problem");
const Submission = require("../models/submission");
const { getLanguageById, submitBatch, submitToken } = require("../utils/problemUtility");

const submitCode = async (req, res) => {
    let submittedResult = null;

    try {
        const userId = req.result._id;
        const problemId = req.params.id;
        let { code, language } = req.body;

        // Validate required fields
        if (!userId || !code || !problemId || !language) {
            return res.status(400).send("Some field missing");
        }

        // Normalize C++ language name
        if (language === "cpp") {
            language = "c++";
        }

        console.log(language);

        // Fetch problem from database
        const problem = await Problem.findById(problemId);

        if (!problem) {
            return res.status(404).send("Problem not found");
        }

        // Check hidden test cases
        if (!problem.hiddenTestCases || problem.hiddenTestCases.length === 0) {
            return res.status(400).json({
                accepted: false,
                error: "No hidden test cases found for this problem."
            });
        }

        // Create pending submission
        submittedResult = await Submission.create({
            userId,
            problemId,
            code,
            language,
            status: "pending",
            testCasesTotal: problem.hiddenTestCases.length
        });

        // Get Judge0 language ID
        const languageId = getLanguageById(language);

        if (!languageId) {
            submittedResult.status = "error";
            submittedResult.errorMessage = "Unsupported programming language";
            await submittedResult.save();

            return res.status(400).json({
                accepted: false,
                error: "Unsupported programming language"
            });
        }

        // Prepare hidden test cases for Judge0
        const submissions = problem.hiddenTestCases.map((testcase) => ({
            source_code: code,
            language_id: languageId,
            stdin: testcase.input,
            expected_output: testcase.output
        }));

        // Submit batch to Judge0
        const submitResult = await submitBatch(submissions);

        const resultToken = submitResult.map((value) => value.token);

        // Get execution results
        const testResult = await submitToken(resultToken);

        // Calculate submission results
        let testCasesPassed = 0;
        let runtime = 0;
        let memory = 0;
        let status = "accepted";
        let errorMessage = null;

        for (const test of testResult) {
            if (test.status_id === 3) {
                testCasesPassed++;
                runtime += parseFloat(test.time || 0);
                memory = Math.max(memory, test.memory || 0);
            } else {
                status = "error";

                if (test.status_id === 4) {
                    status = "wrong";
                    errorMessage = "Wrong Answer";
                } else if (test.status_id === 5) {
                    status = "tle";
                    errorMessage = "Time Limit Exceeded";
                } else if (test.status_id === 6) {
                    errorMessage =
                        test.compile_output || test.message || "Compilation Error";
                } else if (test.status_id === 1 || test.status_id === 2) {
                    errorMessage = "Code execution is still processing. Please try again.";
                } else {
                    errorMessage =
                        test.stderr || test.message || "Runtime Error";
                }

                // Stop if any test case fails
                break;
            }
        }

        // Update submission in database
        submittedResult.status = status;
        submittedResult.testCasesPassed = testCasesPassed;
        submittedResult.errorMessage = errorMessage;
        submittedResult.runtime = runtime;
        submittedResult.memory = memory;

        await submittedResult.save();

        // Mark problem as solved ONLY if submission is accepted
        const accepted = status === "accepted";

        if (
            accepted &&
            !req.result.problemSolved.some(
                (id) => id.toString() === problemId.toString()
            )
        ) {
            req.result.problemSolved.push(problemId);
            await req.result.save();
        }

        // Send response
        return res.status(201).json({
            accepted,
            totalTestCases: submittedResult.testCasesTotal,
            passedTestCases: testCasesPassed,
            runtime: submittedResult.runtime,
            memory: submittedResult.memory,
            error: errorMessage
        });

    } catch (err) {
        console.error("Submit Code Error:", err);

        if (submittedResult) {
            submittedResult.status = "error";
            submittedResult.errorMessage = err.message || err.toString();
            await submittedResult.save();
        }

        return res.status(500).json({
            accepted: false,
            error: err.message || err.toString()
        });
    }
};


const runCode = async (req, res) => {
    try {
        const userId = req.result._id;
        const problemId = req.params.id;
        let { code, language } = req.body;

        // Validate required fields
        if (!userId || !code || !problemId || !language) {
            return res.status(400).send("Some field missing");
        }

        // Fetch problem
        const problem = await Problem.findById(problemId);

        if (!problem) {
            return res.status(404).send("Problem not found");
        }

        // Normalize C++ language name
        if (language === "cpp") {
            language = "c++";
        }

        // Check visible test cases
        if (!problem.visibleTestCases || problem.visibleTestCases.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No visible test cases found for this problem."
            });
        }

        // Get Judge0 language ID
        const languageId = getLanguageById(language);

        if (!languageId) {
            return res.status(400).json({
                success: false,
                error: "Unsupported programming language"
            });
        }

        // Prepare visible test cases
        const submissions = problem.visibleTestCases.map((testcase) => ({
            source_code: code,
            language_id: languageId,
            stdin: testcase.input,
            expected_output: testcase.output
        }));

        // Submit to Judge0
        const submitResult = await submitBatch(submissions);

        const resultToken = submitResult.map((value) => value.token);

        // Get execution results
        const testResult = await submitToken(resultToken);

        let testCasesPassed = 0;
        let runtime = 0;
        let memory = 0;
        let success = true;
        let errorMessage = null;

        for (const test of testResult) {
            if (test.status_id === 3) {
                testCasesPassed++;
                runtime += parseFloat(test.time || 0);
                memory = Math.max(memory, test.memory || 0);
            } else {
                success = false;

                if (test.status_id === 4) {
                    errorMessage = "Wrong Answer";
                } else if (test.status_id === 5) {
                    errorMessage = "Time Limit Exceeded";
                } else if (test.status_id === 6) {
                    errorMessage =
                        test.compile_output || test.message || "Compilation Error";
                } else if (test.status_id === 1 || test.status_id === 2) {
                    errorMessage = "Code execution is still processing. Please try again.";
                } else {
                    errorMessage =
                        test.stderr || test.message || "Runtime Error";
                }

                break;
            }
        }

        return res.status(200).json({
            success,
            testCases: testResult,
            testCasesPassed,
            totalTestCases: problem.visibleTestCases.length,
            runtime,
            memory,
            error: errorMessage
        });

    } catch (err) {
        console.error("Run Code Error:", err);

        return res.status(500).json({
            success: false,
            error: err.message || err.toString()
        });
    }
};


module.exports = { submitCode, runCode };
