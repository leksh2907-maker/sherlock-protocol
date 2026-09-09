"""
Round 1 quiz content. The correct_option_id is intentionally never sent to
the frontend — routes/competition_routes.py strips it before responding to
participants, and only uses it server-side to compute scores.
"""

ROUND1_QUESTIONS = [
    {
        "id": "q1",
        "question": "In most C-style languages, what does the '==' operator do?",
        "options": [
            {"id": "a", "label": "Assigns a value to a variable"},
            {"id": "b", "label": "Compares two values for equality"},
            {"id": "c", "label": "Declares a constant"},
            {"id": "d", "label": "Concatenates two strings"},
        ],
        "correct_option_id": "b",
    },
    {
        "id": "q2",
        "question": "What is the time complexity of binary search on a sorted array of n elements?",
        "options": [
            {"id": "a", "label": "O(n)"},
            {"id": "b", "label": "O(n log n)"},
            {"id": "c", "label": "O(log n)"},
            {"id": "d", "label": "O(1)"},
        ],
        "correct_option_id": "c",
    },
    {
        "id": "q3",
        "question": "In Python, which data type is immutable?",
        "options": [
            {"id": "a", "label": "list"},
            {"id": "b", "label": "dict"},
            {"id": "c", "label": "set"},
            {"id": "d", "label": "tuple"},
        ],
        "correct_option_id": "d",
    },
    {
        "id": "q4",
        "question": "Which of these best describes a 'race condition'?",
        "options": [
            {"id": "a", "label": "A program that runs slower than expected"},
            {
                "id": "b",
                "label": "A bug where the outcome depends on the timing of concurrent operations",
            },
            {"id": "c", "label": "An infinite loop caused by recursion"},
            {"id": "d", "label": "A syntax error caught only at runtime"},
        ],
        "correct_option_id": "b",
    },
    {
        "id": "q5",
        "question": "What does SQL's JOIN clause do?",
        "options": [
            {"id": "a", "label": "Deletes duplicate rows from a table"},
            {"id": "b", "label": "Combines rows from two or more tables based on a related column"},
            {"id": "c", "label": "Creates a new database"},
            {"id": "d", "label": "Sorts a table's rows alphabetically"},
        ],
        "correct_option_id": "b",
    },
]


def public_questions():
    """Question + options only — never includes correct_option_id."""
    return [
        {"id": q["id"], "question": q["question"], "options": q["options"]}
        for q in ROUND1_QUESTIONS
    ]


def answer_key() -> dict:
    return {q["id"]: q["correct_option_id"] for q in ROUND1_QUESTIONS}
