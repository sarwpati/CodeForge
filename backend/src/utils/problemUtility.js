
const axios = require("axios");

// Get Judge0 language ID
const getLanguageById = (lang) => {
    const language = {
        "c++": 54,
        "java": 62,
        "javascript": 63
    };

    return language[lang.toLowerCase()];
};


// Common Judge0 API configuration
const judge0 = axios.create({
    baseURL: "https://judge0-ce.p.rapidapi.com",
    headers: {
        "x-rapidapi-key": process.env.JUDGE0_KEY,
        "x-rapidapi-host": "judge0-ce.p.rapidapi.com",
        "Content-Type": "application/json"
    },
    timeout: 15000
});


// Submit multiple test cases to Judge0
const submitBatch = async (submissions) => {
    if (!process.env.JUDGE0_KEY) {
        throw new Error("Judge0 API key is missing");
    }

    if (!submissions || submissions.length === 0) {
        throw new Error("No submissions provided");
    }

    const encodedSubmissions = submissions.map((sub) => ({
        ...sub,
        source_code: Buffer.from(sub.source_code || "").toString("base64"),
        stdin: Buffer.from(sub.stdin || "").toString("base64"),
        expected_output: Buffer.from(sub.expected_output || "").toString("base64")
    }));

    try {
        const response = await judge0.post(
            "/submissions/batch",
            { submissions: encodedSubmissions },
            {
                params: {
                    base64_encoded: "true"
                }
            }
        );

        if (!Array.isArray(response.data)) {
            throw new Error("Invalid response received from Judge0");
        }

        return response.data;

    } catch (error) {
        console.error(
            "Judge0 submitBatch Error:",
            error.response?.data || error.message
        );

        throw new Error(
            "Failed to submit code to Judge0: " +
            (error.response?.data?.message || error.message)
        );
    }
};


// Wait helper
const waiting = (timer) => {
    return new Promise((resolve) => setTimeout(resolve, timer));
};


// Get execution results using Judge0 tokens
const submitToken = async (resultToken) => {

    if (!Array.isArray(resultToken) || resultToken.length === 0) {
        throw new Error("No Judge0 tokens provided");
    }

    const startTime = Date.now();
    const maxWaitTime = 30000;

    try {
        while (Date.now() - startTime < maxWaitTime) {

            const response = await judge0.get(
                "/submissions/batch",
                {
                    params: {
                        tokens: resultToken.join(","),
                        base64_encoded: "true",
                        fields: "*"
                    }
                }
            );

            const submissions = response.data.submissions;

            if (!Array.isArray(submissions) ||
                submissions.length !== resultToken.length) {
                throw new Error("Invalid Judge0 submission results");
            }

            // Status 1 = In Queue
            // Status 2 = Processing
            // Status greater than 2 = Finished
            const isCompleted = submissions.every(
                (result) => result.status_id > 2
            );

            if (isCompleted) {

                // Decode Base64 output
                return submissions.map((result) => ({
                    ...result,

                    stdout: result.stdout
                        ? Buffer.from(result.stdout, "base64").toString("utf8")
                        : null,

                    stderr: result.stderr
                        ? Buffer.from(result.stderr, "base64").toString("utf8")
                        : null,

                    compile_output: result.compile_output
                        ? Buffer.from(result.compile_output, "base64").toString("utf8")
                        : null,

                    message: result.message
                        ? Buffer.from(result.message, "base64").toString("utf8")
                        : null,

                    stdin: result.stdin
                        ? Buffer.from(result.stdin, "base64").toString("utf8")
                        : null,

                    expected_output: result.expected_output
                        ? Buffer.from(result.expected_output, "base64").toString("utf8")
                        : null
                }));
            }

            // Wait 1 second before checking again
            await waiting(1000);
        }

        throw new Error("Judge0 execution timed out after 30 seconds");

    } catch (error) {
        console.error(
            "Judge0 submitToken Error:",
            error.response?.data || error.message
        );

        throw new Error(
            "Failed to get Judge0 execution results: " + error.message
        );
    }
};


module.exports = {
    getLanguageById,
    submitBatch,
    submitToken
};
