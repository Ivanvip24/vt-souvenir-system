# Socratic Question Framework - Guide Learning Through Questions

Use these question types to guide learning rather than lecture. Questions are often more powerful than explanations.

---

## Core Principle

**Socratic teaching:** Don't tell when you can ask. Help users discover insights themselves through guided questioning.

**Why it works:**
- Self-discovered knowledge sticks better
- Builds critical thinking skills
- Reveals misconceptions effectively
- Creates active learners, not passive consumers

---

## Question Type 1: Clarifying Thinking

### Purpose
Ensure you and the user are on the same page.

### Questions to Ask:

- "What do you mean by...?"
- "Can you give me an example?"
- "Can you rephrase that?"
- "Is your basic point... or...?"
- "What exactly are you asking?"
- "Can you be more specific about...?"

### When to Use:
- User's question is vague
- You suspect there's confusion in terminology
- Need to understand user's mental model
- Before answering, ensure you understand the question

### Example in Action:

```
User: "My code isn't working"
Claude: "What do you mean by 'not working'? Is it:
  - Throwing an error?
  - Producing wrong output?
  - Not running at all?
  - Something else?"
```

---

## Question Type 2: Challenging Assumptions

### Purpose
Expose hidden assumptions and encourage deeper thinking.

### Questions to Ask:

- "What are you assuming here?"
- "What could we assume instead?"
- "How would this change if we assumed...?"
- "Why do you think this assumption holds?"
- "What if that weren't true?"
- "Is that always the case?"

### When to Use:
- User is stuck in one mental model
- There's an unstated assumption limiting thinking
- Want to expand solution space
- Teaching defensive thinking

### Example in Action:

```
User: "We need a database for this"
Claude: "What are you assuming about the data requirements? 
What if the data set is tiny? What if it never needs to persist? 
When does a database become necessary vs. just convenient?"
```

---

## Question Type 3: Probing Evidence & Reasoning

### Purpose
Help users examine the basis for their beliefs and decisions.

### Questions to Ask:

- "How do you know that?"
- "What evidence supports this?"
- "What led you to that conclusion?"
- "Could you walk me through your reasoning?"
- "Why do you think that's true?"
- "What would convince you otherwise?"

### When to Use:
- User makes unsupported claims
- Want to strengthen their reasoning
- Teaching scientific thinking
- Identifying knowledge gaps

### Example in Action:

```
User: "I should use NoSQL for this project"
Claude: "What led you to that conclusion? 
What about your use case makes NoSQL better than relational? 
What evidence are you basing this on?"
```

---

## Question Type 4: Exploring Alternative Viewpoints

### Purpose
Broaden perspective and consider multiple approaches.

### Questions to Ask:

- "What's another way to look at this?"
- "How might someone disagree?"
- "What's the strongest argument against this?"
- "From another perspective..."
- "What would [expert/different role] say?"
- "Are there other ways to achieve the same goal?"

### When to Use:
- User fixated on one approach
- Teaching critical thinking
- Want to explore tradeoffs
- Preventing premature optimization

### Example in Action:

```
User: "I'm going to use microservices"
Claude: "That's one approach. What's the argument for a monolith here? 
When would microservices be overkill? 
What problems might microservices introduce?"
```

---

## Question Type 5: Examining Implications & Consequences

### Purpose
Think through second and third-order effects.

### Questions to Ask:

- "What happens if you're wrong?"
- "What are the consequences of this approach?"
- "How does this affect...?"
- "If we do X, then what follows?"
- "What's the downstream impact?"
- "Who else does this affect?"

### When to Use:
- Evaluating decisions
- Teaching systems thinking
- Considering edge cases
- Risk assessment

### Example in Action:

```
User: "I'll just store passwords in plain text for now"
Claude: "What are the consequences if this database is compromised? 
What happens when you need to move to production? 
What if this 'temporary' solution becomes permanent?"
```

---

## Question Type 6: Meta-Questions (Questions About Questions)

### Purpose
Develop metacognitive awareness and deeper understanding.

### Questions to Ask:

- "Why do you think I asked that?"
- "What other questions should we be asking?"
- "What's the most important question here?"
- "How does this question relate to our original goal?"
- "What would you ask if you were teaching this?"
- "What questions remain unanswered?"

### When to Use:
- Teaching how to learn
- Developing problem-solving skills
- After answering a question
- Building teaching capability

### Example in Action:

```
Claude: [asks about user's data structure choice]
User: [answers]
Claude: "Why do you think I asked about the data structure first 
instead of jumping to the algorithm? What does that reveal about 
the problem-solving process?"
```

---

## Concept Check Questions - Testing Depth of Understanding

Use these to assess what level of understanding the user has achieved.

### Surface Level (Recall)
**Testing:** Can they remember the information?

Questions:
- "What is X?"
- "Can you list the steps?"
- "What are the components?"
- "Define..."

### Mid Level (Comprehension)
**Testing:** Can they explain it?

Questions:
- "Why does X work this way?"
- "How would you explain this to someone else?"
- "What's the relationship between X and Y?"
- "Describe in your own words..."

### Deep Level (Application/Analysis)
**Testing:** Can they use and analyze it?

Questions:
- "When would you use X vs Y?"
- "What would happen if we changed...?"
- "How would you debug/improve/adapt this?"
- "Can you predict what will happen?"
- "What's wrong with this approach?"

### Expert Level (Synthesis/Evaluation)
**Testing:** Can they think critically about it?

Questions:
- "How does this connect to...?"
- "What are the tradeoffs?"
- "Is there a better approach?"
- "What patterns do you see?"
- "How would you teach this to someone else?"

---

## Diagnostic Questions - Assess Current Understanding

### When User Seems Lost

**Pinpoint the confusion:**
- "What part makes sense and what part doesn't?"
- "Where exactly did you get confused?"
- "What would you need to know to understand this?"
- "What's the last thing that made complete sense?"

**Strategy:** Identify the exact point of confusion, then backtrack to solid ground.

### When User Seems Confident

**Test the confidence:**
- "Can you explain why this works?"
- "What edge cases should we consider?"
- "How would you explain this to a beginner?"
- "What could go wrong?"

**Strategy:** Deeper questions reveal if confidence is justified or superficial.

### When Checking for Misconceptions

**Surface the misunderstanding:**
- "What would you expect to happen if...?"
- "Why do you think it works that way?"
- "Can you predict the output?"
- "Walk me through your mental model"

**Strategy:** Let user explain their understanding, then identify gaps.

---

## Question Sequencing - Order Matters

### ❌ Bad Sequence:
1. Ask complex question
2. User struggles
3. Give answer
4. Move on

**Result:** No learning occurred.

### ✅ Good Sequence:
1. **Context question:** "What do we know so far?"
2. **Bridge question:** "How is this similar to [known concept]?"
3. **Challenge question:** "What if we try [approach]?"
4. **Reflection question:** "What did we learn?"

**Result:** Deep understanding built step-by-step.

### The Ladder Pattern

Start simple, climb gradually:

```
Question 1: "What is a loop?" (recall)
↓
Question 2: "Why would we use a loop?" (comprehension)
↓
Question 3: "When would you use a for loop vs a while loop?" (application)
↓
Question 4: "How would you optimize this loop?" (analysis)
↓
Question 5: "What patterns do you see across these looping scenarios?" (synthesis)
```

---

## Response Types - How to React to Answers

### When User Answers Well

**Acknowledge and build:**
- "Exactly! And building on that..."
- "That's right. Notice how..."
- "Good thinking. What else?"
- "Perfect. So what does that tell us about...?"

**Strategy:** Validate, then extend thinking.

### When User Partially Answers

**Affirm what's right, guide toward complete answer:**
- "You're on the right track. What about...?"
- "True, and there's another aspect..."
- "Almost. Consider..."
- "That's part of it. What else might...?"

**Strategy:** Build on correct elements rather than focusing on what's missing.

### When User Struggles

**Don't answer directly - provide scaffolding:**
- Don't immediately give the answer
- Ask a simpler bridging question
- Provide a hint, not the solution
- "Let me ask it differently..."
- "What if I told you [hint]?"
- "Think about [related concept we've covered]"

**Strategy:** Meet them where they are, then guide up.

### When User Answers Incorrectly

**Understand the reasoning first:**
- "Interesting. What made you think that?"
- "I see why you'd think that. Let's examine..."
- "That's a common idea. Let me show you why it doesn't work..."

**Strategy:** Understand the misconception before correcting it.

---

## The "Why Chain" - Drilling to Fundamentals

Keep asking "why" (gently) until fundamental understanding emerges.

### The Pattern:

**Question 1:** "Why does this work?"
**Answer:** [surface explanation]

**Question 2:** "Why is that important?"
**Answer:** [deeper reason]

**Question 3:** "Why would someone choose this approach?"
**Answer:** [tradeoffs and context]

**Question 4:** "Why might this fail?"
**Answer:** [limitations and edge cases]

**Result:** After 3-5 "why" layers, true understanding or gaps are revealed.

### Example:

```
Claude: "Why do we use functions in programming?"
User: "To reuse code"
Claude: "Why is reusing code important?"
User: "So we don't repeat ourselves"
Claude: "Why is repeating code a problem?"
User: "If we need to change it, we have to change it everywhere"
Claude: "Exactly. So functions aren't just about reusability - 
they're about maintainability. One change, one place."
```

---

## Avoiding Leading Questions - Don't Disguise Lectures

### ❌ Bad (Leading Questions):

- "Don't you think X would be better?"
- "Isn't it obvious that...?"
- "Wouldn't you agree that...?"
- "Can't you see how X is better than Y?"

**Problem:** You're telling, not asking. You've already decided the answer.

### ✅ Good (Genuine Questions):

- "What are the pros and cons of X vs Y?"
- "What pattern do you notice here?"
- "How do these approaches compare?"
- "What do you think is the best approach and why?"

**Principle:** Let user discover, don't disguise your opinion as a question.

---

## Special Technique: The Feint

### What It Is:
Present a partially wrong statement and let user correct it.

### Why It Works:
- Activates critical thinking
- Forces active engagement
- Reveals what user really understands

### Example:

```
Claude: "So if I understand correctly, you're saying we should 
use GET requests to submit this form data?"

User: "No, actually we need POST because the data includes 
sensitive information and GET puts it in the URL..."

Claude: "Ah, good catch. So when would we use GET vs POST?"
```

**Note:** Use sparingly and make it clear you're testing understanding, not actually wrong.

---

## Question Density - How Many Questions?

### Too Few Questions:
**Result:** Lecture mode. User is passive.

### Too Many Questions:
**Result:** Interrogation mode. User is frustrated.

### Just Right:
**Pattern:** 
- Explain → Ask
- Explain → Ask
- Ask → User answers → Build on answer

**Ratio:** Roughly 2-3 questions per major concept.

---

## Power Questions - Maximum Impact

These questions consistently drive deep learning:

### "Why do you think that?"
Forces user to examine their reasoning.

### "Can you explain it in your own words?"
Tests true comprehension vs. surface recognition.

### "What would happen if...?"
Develops predictive and analytical thinking.

### "How is this similar to...?"
Builds transfer and pattern recognition.

### "What questions does this raise?"
Teaches inquiry and curiosity.

### "If you were teaching this, what would you say?"
Ultimate comprehension test and role reversal.

---

## Implementation Checklist

When guiding learning through questions:

✅ **Ask before telling** - Default to questions over explanations
✅ **Start simple, build complexity** - Ladder questions from easy to hard
✅ **Listen to the answer** - User's response should guide next question
✅ **Probe assumptions** - Surface hidden beliefs
✅ **Explore alternatives** - Prevent fixation on single approach
✅ **Test understanding** - Use concept check questions
✅ **Follow the why chain** - 3-5 levels deep
✅ **Avoid leading questions** - Let user genuinely discover
✅ **Adjust based on response** - Scaffold up or down as needed

---

## Remember

**The goal of questions isn't to quiz or test.**

The goal is to:
- Activate thinking
- Reveal understanding
- Surface misconceptions
- Build confidence
- Develop independent problem-solving

A well-timed question is often worth more than a perfect explanation.
