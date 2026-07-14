package com.bong.pet.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.bong.pet.Prefs
import com.bong.pet.R

/**
 * "Phòng" của pet — Phase 0 chỉ là placeholder: pet ngồi đó, hoặc đi vắng
 * thì phòng trống + tờ note. Phase 1 sẽ là Compose room + đồ nội thất.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val prefs = Prefs(this)
                Column(
                    modifier = Modifier.fillMaxSize().padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    if (prefs.isAway) {
                        Text("🚪", style = MaterialTheme.typography.displayLarge)
                        Spacer(Modifier.height(16.dp))
                        Text("phòng trống...", style = MaterialTheme.typography.titleMedium)
                        prefs.awayNote?.let {
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "📝 \"$it\"",
                                style = MaterialTheme.typography.bodyMedium,
                                textAlign = TextAlign.Center,
                            )
                        }
                    } else {
                        Image(
                            painter = painterResource(R.drawable.avatar_happy),
                            contentDescription = null,
                            modifier = Modifier.size(180.dp),
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(prefs.petName, style = MaterialTheme.typography.headlineMedium)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "nó đang ở đây. chờ tin nhắn của nó đi,\nnó sẽ tự nhắn khi nó muốn",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}
