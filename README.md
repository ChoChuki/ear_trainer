# Ear Trainer 2.8.9 · 小提琴与钢琴

解压后，单文件入口是 `single-file/index.html`。用能运行 JavaScript 和 Web Audio 的浏览器打开。这个文件内嵌了原版小提琴、钢琴音源和播放器。包根目录的 `index.html` 是带独立资源的入口，需要同目录的 JS、CSS 和 `vendor/`。音色授权见 [THIRD_PARTY.md](THIRD_PARTY.md)。

首次打开默认小提琴。页首可切换钢琴。集中训练首页可勾选任意组合的可用八度，每件乐器分别保存选择。小提琴覆盖 G3–C8，钢琴覆盖 A0–C8，两种乐器混合时使用共有音域。

## 2.8.9 更新

- 普通钢琴键盘扩展为标准 88 键（A0–C8），由低到高固定排列为七层：A0–B1、C2–B2、C3–B3、C4–B4、C5–B5、C6–B6、C7–C8。取消八度翻页和自动横向跳转。手机、电脑均使用相同布局，较短屏幕可纵向滚动。
- 起止音选择扩展到 88 键；单音默认 C4–B4、双音原默认 C2–B6 和已保存的范围保持不变。测试期间范围外琴键变灰且不提交答案；未进行测试时全部 88 键可自由演奏。每个八度的 C 键、A0 和 C8 有标记。
- 普通版和单文件版同步；小提琴指板、集中训练及抽题、计时、评分、记录格式不变。

## 2.8.8 更新

- 钢琴和小提琴的 Mode 菜单只保留 One Note（单音）、Two Notes（双音）、Free Play（自由演奏）。
- AP 集中训练和音程集中训练仍从页首独立入口进入。旧 AP 课程和 RP 课程的模式入口移除，原实现、历史数据和保存键不删除。原 AP 进步记录仍可查看和导出。旧课程的 URL mode 参数回退到单音。
- 本次只精简乐器模式入口，不改抽题、播放、计时、评分和数据格式。

## 2.8.7 更新

- AP 题间干扰改用当前题目的钢琴或小提琴采样。普通题间奏四个音，刚听过带音名的示范再进入巩固或盲听时，首题前奏六个音。音列每次重抽，与下一题无关。短暂停顿后才播放题目音并开始计时。休息后的首个盲听音直接播放。
- 集中训练和其他练习首次使用均默认 1.3 秒。有记录时沿用已保存的时限，包括 2.5 秒和不限时。可输入 0.1–60 秒，留空或填 0 即不限时。各训练页分别保存。增减学习范围不会改变时限。可重播的练习从重播目标音开始同样计时，重播单独标记。
- AP 的 12 个音名键、八度键 0–8 位置固定。选中练习八度以外的数字显示为灰色。集内音名与八度可按任意顺序输入，以完成答案的一次触按计时。音名和八度分别评分。听到集外音时，可以点“其他音”或任意集外音名，均一键提交，同样得分。
- 相邻 AP 题的音名一定不同，跨八度同样去重。只有一个学习音时，听过这个目标后能排除下一题也是它。题间干扰与短时限用于听辨练习，无法消除这种由抽题规则带来的提示。
- 音程集中训练固定显示 1–12 半音和“其他音程”。旋律音程从第二音开始计时，同时发声的音程从共同起音计时。相对音程课程的数字答题显示 0–24 半音。先唱或先奏在参考音结束后开始限时，有麦克风时从开始收音计时。自行对照答案的评分不占用作答时间。
- 在“其他练习”的模式菜单中选择“自由练习”，直接触键可自由弹奏，点“抽一个音”则进入一道限时听辨。作答或超时后即可接着弹奏。

## 绝对音高练习

| 模式 | 怎么练 | 什么时候看到答案 |
| --- | --- | --- |
| 主动学习（Active learning） | 学习音集里的音出现得更频繁。答案是一个音名加一个八度数字，也可以选“其他音”“不确定”或“靠音程推算”。 | 每题作答后 |
| 巩固练习（Consolidate） | 沿用当前学习音集和答题设置。 | 整组结束后 |
| 盲听报音名（Blind note naming） | 12 题。题目从当前音域能发出的音名中抽取，独立于学习音集。每题播放一次。集内音名要具体回答，八度另计。集外音按“其他音”计分。做完第一题也可以结束。 | 本组结束后 |

若只学 F，听到 F 时点 F 和相应八度。听到 G 时，点“其他音”、G 或其他任一非 F 音名都算对，八度可以跳过。选“不确定”计作未命中。

相邻题会尽量相距至少 13 个半音。音域不足时，选择该音名与前音距离最远的可用八度。休息后的盲听首题另行随机选八度。题间干扰音、作答限时、八度和练习组长度均可调整。限时从估计的发声时刻起算，在设置里输入秒数，默认 1.3 秒，留空或填 0 不限时。程序单独记录超时及自行标记的音程推算。

## 音程集中训练

从页首的“音程集中训练”按钮进入（地址 `#iv`）。结构与 AP 集中训练相同，题目是两个音之间的音程（小二度到八度）。

| 模式 | 怎么练 | 什么时候看到答案 |
| --- | --- | --- |
| 主动学习 | 学习音程集里的音程出现得更频繁，只学一个时约占三到四成。集内音程答半音数，集外音程可选“其他音程”或任意集外数字。 | 每题作答后 |
| 巩固练习 | 沿用当前设置。 | 整组结束后 |
| 盲听音程 | 12 题，从所选八度能奏出的音程中均匀抽取。每题听一次，按当时的学习音程集判分。 | 本组结束后 |

每题在所选八度内随机取音区。相邻题的音程不同（设置里可允许重复），第二个音也不与上一题的目标音同音名。方向可选上行、下行、上下行混合或同时发声。新增音程的建议条件与 AP 相同：最近 14 天、相同设置的至少两组完整练习，每个学习音程至少 5 次首答，音程集外至少 10 次首答，平均命中率和误报率达到自设门槛。建议顺序是纯五度、八度、大三度、小三度、纯四度、大二度、大六度、小二度、小六度、小七度、大七度、三全音。记录保存在本浏览器，可导出、导入备份。示范和反馈只说出音程，不显示音名。

## 怎么看自己有没有进步

练习记录把**间隔至少 4 小时后的盲听首音**与**连续练习**分别列出。观察前一个数字时，看几天累积的“答对数 / 作答数”，也可以展开最近十二次休息后的首音，逐条核对日期、播放的音和你的回答。第一次使用、以及所选音域不足十二音名时的首音也分别显示。

4 小时是便于重复比较的记录条件。本程序只知道同一浏览器和来源记录的练习，无法知道这期间是否在其他地方听过音乐。后续 11 题即使没有反馈，仍有上一题可供比较。选“不确定”、标记音程推算或超时，都会计入作答次数。播放失败和中断的题排除。

旧版集中训练记录仍可从原来的历史记录查看并随 JSON 备份导出。新版盲听统计从 2.8.1 开始。新增学习音名的建议取最近 14 天、相同音集、八度、限时和答题设置的至多六组完整练习。达到自设门槛后，由你决定是否加入。

## 相对音高和计时

相对音高课程和双音练习默认使用当前乐器预设音域内的全部十二音名。两者都从第二个音起计时，超时的题记为答错并写入记录。手动选择音域、音名或课程级别后使用你的选择。相邻题的目标音跨八度去重。相对音高练习在选项允许时，也会更换相邻题的音程。

同一浏览器来源下，两种乐器的有效练习时间可以分段累计。按东京日期，当天累计满 60 分钟会在训练器内提醒一次。暂停、长时间闲置和切到后台的时间不计入。

## 版本对照

2.7.0 排除相邻同名题，单独练 F 时，听到 F 后下一题必定属于“其他音”。2.8.0 允许连续同名，增加跨八度距离、题间干扰和可调限时。在两个版本的默认“独立检查”里，仅用 F / 其他音即可作答。2.8.1 把学习音集与可选答案分开，盲听检查始终要求具体音名。2.8.2 把作答时限扩展到所有作答类练习，并新增音程集中训练。2.8.3 改为固定 1.3 秒，AP 答案改为音名加八度两组按钮。2.8.4 改为输入秒数。2.8.5 盲听报音名加上“其他音”。2.8.6 改为以学习音集判定，当时默认 2.5 秒。2.8.7 恢复新安装默认 1.3 秒。模拟抽题只能验证程序行为。实际训练效果由使用者自己的跨日记录衡量。

源代码包含六种界面语言、原版 WebAudioFont 乐器文件、可选的训练时长同步和 PWA 资源。若沿用既有部署，把根目录文件与 `vendor/` 一同放在原地址即可沿用该来源的浏览器数据。

## Earlier releases and references

Deutsch, D. (1970). Tones and numbers: Specificity of interference in immediate memory. *Science*, 168, 1604–1605 · Deutsch, D. (1972). Mapping of interactions in the pitch memory store. *Science*, 175, 1020–1022 · Shepard, R. N. (1964). Circularity in judgments of relative pitch. *JASA*, 36, 2346–2353 · Wong, Y. K., Cheung, L. Y. T., Ngan, V. S. H., & Wong, A. C.-N. (2025). Learning fast and accurate absolute pitch judgment in adulthood. *Psychonomic Bulletin & Review*, 32, 1676–1688.

Round 3 (Claude) changes from 2.3.1, in short:

- AP rounds show their prompt, right/wrong and the note name beside the answers (in 2.3.1 the violin site hid them).
- The cold check uses the selected range and no longer rewrites From/To.
- Optional interference burst before each AP question; "Other" notes lean towards neighbours of the learned names.
- Day-scale review intervals need a recall made after a break; recent errors and confusions drive review weights.
- "Weak intervals" is a real error-driven review; references cover the whole register in each direction.
- New activity "Sing / play first" (self-check, optional experimental microphone check).
- One tap per question (automatic continue after a hit; a miss waits for Next); no scrolling during a round on 320–430 px screens.
- A waiting new version is offered through an "Update" button, never applied during a round.

Previous versions preserved the Demo score and tempo, Cloudflare training-time protocol,
RP level structure, six languages, stored history formats (new fields are additive; new rows carry protocol 6).

Updating an installed PWA: open it online once; when "Update to the new version" appears in the header, tap it
outside a round (or close every window of the app and reopen it).
