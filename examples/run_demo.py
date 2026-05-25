from forkfit import ForkFitLangGraphWorkflow, demo_meal_pack, demo_user_profile


user = demo_user_profile()
pack = demo_meal_pack()

result = ForkFitLangGraphWorkflow().run(user, pack)

print("success:", result.success)
print("user review:", result.user_agent_output.preference_review.status)
for review in result.reviews:
    print(f"{review.agent} review:", review.status)
    for finding in review.findings:
        print(f"  - {finding.type}: {finding.message}")
print("summary:", result.adapter_output.summary)
for change in result.adapter_output.change_log:
    print(f"- {change.affected_item}: {change.from_value} -> {change.to_value}")
print("final meal:", result.adapter_output.forked_meal_pack.meals[0].name)
print("ingredients:", result.adapter_output.forked_meal_pack.meals[0].ingredients)
