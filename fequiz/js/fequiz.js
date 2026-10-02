(function () {
    var LINKS = {
        qualify: "https://track.mainofferpage.online/click",
        debt: "https://www.nz91nyfbo.com/ZZ2GX/4MQCFX/",
        sleep: "https://www.gumbixyz.com/8XFSC8/2ZNH3GS/"
    };

    var chat = window.chat;

    chat.wait = function (callback, delay = 605) {
        if (typeof callback === 'function') {
            setTimeout(callback, delay);
        }
    };

    function claimButton(link) {
        chat.showOptions(["Click Here To Claim It Now ->"], chat.position.HORIZONTAL, false, function () {
            chat.goToPage(link, false);
        }, null, function (block, option) {
            option.setAttribute("id", "ClaimNow");
        });
    }

    function qualify() {
        chat.showMessage("Checking eligibility…");
        chat.showMessage("Reviewing your responses against program requirements...");
        chat.showMessage("🎉 Good news! You may qualify for a lower mortgage rate — as low as 2.5%!");
        chat.showMessage("Based on your answers, you appear to meet the initial eligibility criteria. Complete your full application to see your personalized rate in 60 seconds.");
        // chat.showMessage("🔒 Secure • No SSN required • Free eligibility check • 60 seconds");
        claimButton(LINKS.qualify);
    }

    function debtYes() {
        chat.showMessage("Checking eligibility…");
        chat.showMessage("Reviewing your responses against program requirements...");
        chat.showMessage("Tap the button below to claim now.");
        claimButton(LINKS.debt);
    }

    function sleepStudy() {
        chat.showMessage("Checking eligibility…");
        chat.showMessage("Reviewing your responses against program requirements...");
        chat.showMessage("While you don't qualify for a lower mortgage rate today, based on your answers, you DO qualify to join a 3-day sleep research study in your area that will pay you $3,600! 🎉");
        chat.showMessage("Limited spots available — tap the button below to claim yours.");
        claimButton(LINKS.sleep);
    }

    /* Same logic as glo2b:
       Q1 credit > 670?  YES → Q2 mortgage > $150k?  YES → qualify
                         NO  → debt question          NO  → debt question
       Debt > $8k?       YES → debt offer   NO → sleep study offer */
    function askDebt() {
        chat.showMessage("Question 2 of 2: Do you have over $8k in credit card debt?");
        chat.showOptions(["YES", "NO"]);
        chat.waitResponse(function (answer) {
            if (answer == "YES") debtYes();
            else sleepStudy();
        });
    }

    chat.showMessage("Hi 👋");
    chat.showMessage("I'm Sarah with GovRateAlerts.");
    chat.showMessage("I'll ask you 2 quick questions to check if you qualify for claiming the lowest rate on your mortgage today! Please be honest 👇");
    chat.showMessage("Q1. Is your credit score over 670?");
    chat.showOptions(["YES", "NO"]);

    chat.waitResponse(function (credit) {
        if (credit != "YES") {
            askDebt();
            return;
        }
        chat.showMessage("Q2. Is your current mortgage balance over $150k?");
        chat.showOptions(["YES", "NO"]);
        chat.waitResponse(function (mortgage) {
            if (mortgage == "YES") qualify();
            else askDebt();
        });
    });

    chat.start(
        document.getElementById("chat-container"),
        document.getElementById("main")
    );
})();
