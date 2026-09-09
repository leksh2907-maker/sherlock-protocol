"""Hidden stdin/stdout cases for the seeded Round 2 problems."""

ROUND2_HIDDEN_TESTS = {
    "The Missing Commit": [
        {"input": "4\n30 45 46 90\n", "output": "44\n"},
        {"input": "4\n0 10 11 20\n", "output": "9\n"},
    ],
    "Balanced Evidence Tags": [
        {"input": "(evidence[1]{ok})\n", "output": "true\n"},
        {"input": "(evidence[1)\n", "output": "false\n"},
    ],
    "Suspect Frequency Count": [
        {"input": "4\nRyan\nAlex\nRyan\nEmma\n", "output": "Ryan\n"},
        {"input": "2\nAlex\nEmma\n", "output": "Alex\n"},
    ],
    "Timestamp Reordering": [
        {"input": "3\n09:15\n08:40\n08:42\n", "output": "08:40\n08:42\n09:15\n"},
        {"input": "2\n23:59\n00:01\n", "output": "00:01\n23:59\n"},
    ],
    "Duplicate Access Card": [
        {"input": "3\n4 7 4\n", "output": "true\n"},
        {"input": "3\n1 2 3\n", "output": "false\n"},
    ],
    "Build Duration": [
        {"input": "3\n3 5 2\n", "output": "10\n"},
        {"input": "4\n0 7 1 2\n", "output": "10\n"},
    ],
    "Access Window": [
        {"input": "3\n1 4 8\n2 8\n", "output": "2\n"},
        {"input": "5\n0 2 5 7 10\n3 7\n", "output": "2\n"},
    ],
    "Evidence Merge": [
        {"input": "2 2\n1 3\n2 3\n", "output": "1 2 3\n"},
        {"input": "3 2\n1 2 4\n2 5\n", "output": "1 2 4 5\n"},
    ],
    "First Anomaly": [
        {"input": "3\n5 5 8\n", "output": "2\n"},
        {"input": "4\n7 7 7 7\n", "output": "-1\n"},
    ],
}